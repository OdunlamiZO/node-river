import { InsertOpts, Job, JobArgs } from '../types';
import InsertResult from '../types/insert-result';

/**
 * Common interface all River drivers must implement (e.g. PgDriver).
 * `Tx` is the driver-specific transaction type (e.g. `PoolClient` for pg).
 */
export default interface Driver<Tx> {
  /**
   * Verifies the driver can reach the database. Throws if the connection fails.
   */
  verifyConnection(): Promise<void>;

  /**
   * Closes all database connections and frees resources.
   */
  close(): Promise<void>;

  /**
   * Inserts a single job into the queue.
   * @param args - Job arguments including `kind` and any job-specific fields.
   * @param opts - Insertion options: queue, maxAttempts, priority, tags, etc.
   * @returns The inserted job and a `skipped` flag if deduplicated by uniqueness.
   */
  insert<T extends JobArgs>(args: T, opts: InsertOpts): Promise<InsertResult<T>>;

  /**
   * Inserts a single job within an existing transaction.
   * @param tx - The active transaction (type is driver-specific).
   * @param args - Job arguments including `kind` and any job-specific fields.
   * @param opts - Insertion options: queue, maxAttempts, priority, tags, etc.
   * @returns The inserted job and a `skipped` flag if deduplicated by uniqueness.
   */
  insertTx<T extends JobArgs>(tx: Tx, args: T, opts: InsertOpts): Promise<InsertResult<T>>;

  /**
   * Inserts multiple jobs in a single transaction. Rolls back all if any fail.
   * @param jobs - Array of `{ args, opts }` pairs, one per job.
   * @returns An array of InsertResult objects in the same order as the input.
   */
  insertMany<T extends JobArgs>(jobs: { args: T; opts: InsertOpts }[]): Promise<InsertResult<T>[]>;

  /**
   * Returns a new transaction object for use with `insertTx`.
   * Caller is responsible for committing or rolling back.
   */
  getTx(): Promise<Tx>;

  /**
   * Atomically claims up to `limit` available jobs and marks them as running.
   * Uses `FOR UPDATE SKIP LOCKED` to prevent concurrent workers from double-claiming.
   * @param queue - The queue to fetch jobs from.
   * @param limit - Max number of jobs to claim, based on available concurrency slots.
   * @param clientId - This client's ID, appended to the job's `attemptedBy` list.
   * @returns Array of claimed jobs ready to be worked.
   */
  getAvailableJobs(queue: string, limit: number, clientId: string): Promise<Job[]>;

  /**
   * Marks a job as `completed` and stamps `finalizedAt`.
   * @param id - The ID of the job to complete.
   */
  completeJob(id: number): Promise<void>;

  /**
   * Marks a job as `retryable` (with exponential backoff) or `discarded` (if max attempts reached).
   * Appends the error details to the job's `errors` array.
   * @param id - The ID of the job that failed.
   * @param error - The error thrown by the worker.
   * @param attempt - The attempt number that failed.
   * @param maxAttempts - The job's maximum allowed attempts.
   */
  failJob(id: number, error: Error, attempt: number, maxAttempts: number): Promise<void>;
}
