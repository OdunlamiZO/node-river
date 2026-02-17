// RiverQueue driver implementation using the 'pg' library.
import { Buffer } from 'buffer';
import { Pool, PoolConfig } from 'pg';
import { InsertOpts, InsertResult, Job, JobArgs } from '../../types';
import { bitmaskToJobStates, mapToUniqueKey } from '../../utils';
import Driver from '../driver';
import Options from './pg-options';

// Implements the RiverQueue Driver interface using the 'pg' library.
export default class PgDriver implements Driver {
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
    if (!opts.queue) {
      throw new Error('Queue name is required in InsertOpts');
    }

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
      let values: (Buffer | string | number | string[])[] = [uniqueKey];

      if (stateList.length > 0) {
        query += ' AND state = ANY($2)';
        values.push(stateList);
      }

      query += ' LIMIT 1';

      const result = await this.pool.query<
        Omit<Job, 'uniqueStates'> & { uniqueStates: Buffer | null }
      >(query, values);

      if (result.rows.length > 0) {
        const row = result.rows[0];

        return this.mapRowToInsertResult(row, true);
      }
    }

    const { kind, ...restArgs } = args;
    const columns = ['kind', 'args', 'queue', 'max_attempts'];
    const values: (string | number | string[] | Buffer)[] = [
      kind,
      JSON.stringify(restArgs),
      opts.queue,
      opts.maxAttempts,
    ];

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

    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const query = `INSERT INTO river_job (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING
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
    const result = await this.pool.query<
      Omit<Job, 'uniqueStates'> & { uniqueStates: Buffer | null }
    >(query, values);

    const row = result.rows[0];
    if (!row) return row;

    return this.mapRowToInsertResult(row, false);
  }

  /**
   * Helper to map a DB row to a Job<T> and InsertResult.
   */
  private mapRowToInsertResult<T extends JobArgs>(
    row: Omit<Job, 'uniqueStates'> & { uniqueStates: Buffer | null },
    skipped: boolean,
  ): InsertResult<T> {
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
