// RiverQueue driver implementation using the 'pg' library.
import { Buffer } from 'buffer';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { InsertOpts, InsertResult, Job, JobArgs, JobState } from '../../types';
import { bitmaskToJobStates, mapToUniqueKey } from '../../utils';
import Driver from '../driver';
import Options from './pg-options';

// pg object that can run SQL queries.
type QueryExecutor = Pick<Pool, 'query'>;

// Row returned by pg before unique state bitmasks are decoded.
type PgRow = Omit<Job, 'uniqueStates'> & { uniqueStates: Buffer | null };

// Value type bound into pg insert query parameters.
type PgValue = string | number | Buffer;

// Column names and bound values for one pg insert row.
type PgInsert = {
  columns: string[];
  values: PgValue[];
};

// Shared RETURNING columns for pg job insert queries.
const JOB_RETURNING_COLUMNS = `
      id,
      state,
      attempt,
      max_attempts as "maxAttempts",
      attempted_at as "attemptedAt",
      created_at as "createdAt",
      finalized_at as "finalizedAt",
      scheduled_at as "scheduledAt",
      priority,
      args,
      attempted_by as "attemptedBy",
      errors,
      kind,
      metadata,
      queue,
      tags,
      unique_key as "uniqueKey",
      unique_states as "uniqueStates"`;

// Implements the RiverQueue Driver interface using the 'pg' library.
export default class PgDriver implements Driver<PoolClient> {
  private readonly pool: Pool;

  /**
   * Creates a new PgDriver instance.
   * @param options - Options for configuring the RiverQueue pg driver connection pool. Fields include:
   *   - connectionString: Database connection string
   *   - connectionTimeoutMillis: Optional, connection timeout in milliseconds
   *   - idleTimeoutMillis: Optional, idle timeout in milliseconds
   *   - max: Optional, maximum number of clients in the pool
   */
  constructor(options: Options) {
    const config: PoolConfig = { ...options };
    this.pool = new Pool(config);
  }

  async verifyConnection(): Promise<void> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(
        `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async insert<T extends JobArgs>(args: T, opts: InsertOpts): Promise<InsertResult<T>> {
    return this.insertWithQueryExecutor(this.pool, args, opts);
  }

  async insertTx<T extends JobArgs>(
    tx: PoolClient,
    args: T,
    opts: InsertOpts,
  ): Promise<InsertResult<T>> {
    return this.insertWithQueryExecutor(tx, args, opts);
  }

  async insertMany<T extends JobArgs>(
    jobs: { args: T; opts: InsertOpts }[],
  ): Promise<InsertResult<T>[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const results: InsertResult<T>[] = [];
      let batch: { index: number; insert: PgInsert }[] = [];
      let batchColumnKey: string | null = null;

      const flushBatch = async (): Promise<void> => {
        if (batch.length === 0) return;

        const batchResults = await this.insertBatchTx<T>(
          client,
          batch.map((job) => job.insert),
        );

        batch.forEach((job, i) => {
          results[job.index] = batchResults[i];
        });

        batch = [];
        batchColumnKey = null;
      };

      for (const [index, job] of jobs.entries()) {
        if (job.opts.uniqueOpts) {
          await flushBatch();
          results[index] = await this.insertTx(client, job.args, job.opts);
          continue;
        }

        const insert = this.buildPgInsert(job.args, job.opts);
        const columnKey = insert.columns.join('\0');
        if (batchColumnKey && batchColumnKey !== columnKey) {
          await flushBatch();
        }

        batch.push({ index, insert });
        batchColumnKey = columnKey;
      }

      await flushBatch();
      await client.query('COMMIT');

      return results;
    } catch (error) {
      await client.query('ROLLBACK');

      throw error;
    } finally {
      client.release();
    }
  }

  async getTx(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async getAvailableJobs(queue: string, limit: number, clientId: string): Promise<Job[]> {
    const result = await this.pool.query<Job>(
      `
      UPDATE river_job
      SET state = 'running',
          attempt = attempt + 1,
          attempted_at = NOW(),
          attempted_by = array_append(COALESCE(attempted_by, '{}'), $1)
      WHERE id IN (
        SELECT id FROM river_job
        WHERE state = 'available'
          AND queue = $2
          AND scheduled_at <= NOW()
        ORDER BY priority, scheduled_at, id
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        state,
        attempt,
        max_attempts as "maxAttempts",
        attempted_at as "attemptedAt",
        created_at as "createdAt",
        finalized_at as "finalizedAt",
        scheduled_at as "scheduledAt",
        priority,
        args,
        attempted_by as "attemptedBy",
        errors,
        kind,
        metadata,
        queue,
        tags,
        unique_key as "uniqueKey",
        unique_states as "uniqueStates"
    `,
      [clientId, queue, limit],
    );

    return result.rows;
  }

  async completeJob(id: number): Promise<void> {
    await this.pool.query(
      `
      UPDATE river_job
      SET state = $1,
          finalized_at = NOW()
      WHERE id = $2
    `,
      [JobState.Completed, id],
    );
  }

  async failJob(id: number, error: Error, attempt: number, maxAttempts: number): Promise<void> {
    const isDiscarded = attempt >= maxAttempts;
    const backoffSeconds = Math.pow(2, attempt);
    const errorEntry = JSON.stringify({ error: error.message, attempt });

    await this.pool.query(
      `
      UPDATE river_job
      SET state = $1,
          finalized_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
          scheduled_at = CASE WHEN $2 THEN scheduled_at ELSE NOW() + ($3 || ' seconds')::interval END,
          errors = array_append(COALESCE(errors, '{}'), $4::jsonb)
      WHERE id = $5
    `,
      [
        isDiscarded ? JobState.Discarded : JobState.Retryable,
        isDiscarded,
        backoffSeconds,
        errorEntry,
        id,
      ],
    );
  }

  // Inserts one job using either the pool or a transaction client.
  private async insertWithQueryExecutor<T extends JobArgs>(
    executor: QueryExecutor,
    args: T,
    opts: InsertOpts,
  ): Promise<InsertResult<T>> {
    if (!opts.maxAttempts) {
      throw new Error('maxAttempts is required in InsertOpts');
    }

    let uniqueKey: Buffer | undefined;
    if (opts.uniqueOpts) {
      uniqueKey = mapToUniqueKey(args, opts);
    }

    if (uniqueKey) {
      const stateList = opts.uniqueOpts?.byState || [];

      let query = 'SELECT * FROM river_job WHERE unique_key = $1';
      let values: (Buffer | string[])[] = [uniqueKey];

      if (stateList.length > 0) {
        query += ' AND state = ANY($2)';
        values.push(stateList);
      }

      query += ' LIMIT 1';

      const result = await executor.query<PgRow>(query, values);

      if (result.rows.length > 0) {
        const row = result.rows[0];

        return this.mapRowToInsertResult(row, true);
      }
    }

    const { columns, values } = this.buildPgInsert(args, opts, uniqueKey);

    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const query = `INSERT INTO river_job (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING
      ${JOB_RETURNING_COLUMNS}`;
    const result = await executor.query<PgRow>(query, values);

    const row = result.rows[0];
    if (!row) return row;

    return this.mapRowToInsertResult(row, false);
  }

  // Builds the column list and parameter values for one job insert.
  private buildPgInsert<T extends JobArgs>(
    args: T,
    opts: InsertOpts,
    uniqueKey?: Buffer,
  ): PgInsert {
    if (!opts.maxAttempts) {
      throw new Error('maxAttempts is required in InsertOpts');
    }

    const { kind, ...restArgs } = args;
    const columns = ['kind', 'args', 'queue', 'max_attempts'];
    const values: PgValue[] = [kind, JSON.stringify(restArgs), opts.queue, opts.maxAttempts];

    if (opts.tags) {
      columns.push('tags');
      values.push(JSON.stringify(opts.tags));
    }

    if (opts.priority) {
      columns.push('priority');
      values.push(opts.priority);
    }

    if (opts.metadata) {
      columns.push('metadata');
      values.push(JSON.stringify(opts.metadata));
    }

    if (opts.scheduledAt) {
      columns.push('scheduled_at');
      values.push(
        opts.scheduledAt instanceof Date ? opts.scheduledAt.toISOString() : opts.scheduledAt,
      );
    }

    if (uniqueKey) {
      columns.push('unique_key');
      values.push(uniqueKey);
    }

    return { columns, values };
  }

  // Inserts compatible non-unique jobs with one multi-row INSERT query.
  private async insertBatchTx<T extends JobArgs>(
    tx: QueryExecutor,
    batch: PgInsert[],
  ): Promise<InsertResult<T>[]> {
    const columns = batch[0].columns;
    const values: PgValue[] = [];
    const valueRows = batch.map((job) => {
      const placeholders = job.values.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });

      return `(${placeholders.join(', ')})`;
    });

    const query = `INSERT INTO river_job (${columns.join(', ')}) VALUES ${valueRows.join(', ')} RETURNING
      ${JOB_RETURNING_COLUMNS}`;
    const result = await tx.query<PgRow>(query, values);

    return result.rows.map((row) => this.mapRowToInsertResult<T>(row, false));
  }

  // Maps a pg row to a typed job insert result.
  private mapRowToInsertResult<T extends JobArgs>(row: PgRow, skipped: boolean): InsertResult<T> {
    return {
      job: {
        ...row,
        args: { ...row.args, kind: row.kind } as T,
        uniqueStates: bitmaskToJobStates(row.uniqueStates),
      },
      skipped,
    };
  }
}
