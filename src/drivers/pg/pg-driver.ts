// RiverQueue driver implementation using the 'pg' library.
import { Pool, PoolConfig } from 'pg';
import Driver from '../driver';
import Options from './pg-options';
import { JobArgs, Job, InsertOpts } from '../../types';

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

  async insert<T extends JobArgs>(args: T, opts: InsertOpts): Promise<Job> {
    const columns = ['kind', 'args', 'queue', 'max_attempts'];
    const values = [args.kind, JSON.stringify(args), opts.queue, opts.maxAttempts];

    if (opts.tags !== undefined) {
      columns.push('tags');
      values.push(JSON.stringify(opts.tags));
    }
    if (opts.priority !== undefined) {
      columns.push('priority');
      values.push(opts.priority);
    }
    if (opts.metadata !== undefined) {
      columns.push('metadata');
      values.push(JSON.stringify(opts.metadata));
    }
    if (opts.scheduledAt !== undefined) {
      columns.push('scheduled_at');
      values.push(
        opts.scheduledAt instanceof Date ? opts.scheduledAt.toISOString() : opts.scheduledAt,
      );
    }

    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const query = `INSERT INTO river_job (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await this.pool.query(query, values);

    const row = result.rows[0];
    if (!row) return row;

    return {
      id: row.id,
      state: row.state,
      attempt: row.attempt,
      maxAttempts: row.max_attempts,
      attemptedAt: row.attempted_at,
      createdAt: row.created_at,
      finalizedAt: row.finalized_at,
      scheduledAt: row.scheduled_at,
      priority: row.priority,
      args: row.args,
      attemptedBy: row.attempted_by,
      errors: row.errors,
      kind: row.kind,
      metadata: row.metadata,
      queue: row.queue,
      tags: row.tags,
      uniqueKey: row.unique_key,
      uniqueStates: row.unique_states,
    };
  }
}
