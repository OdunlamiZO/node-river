import { InsertOpts, JobArgs } from '../types';
import InsertResult from '../types/insert-result';

/**
 * Common interface for all RiverQueue drivers (e.g., Postgres, Prisma, Sequelize, etc.).
 * The generic parameter Tx must be set to the driver's transaction/session type.
 */
export default interface Driver<Tx> {
  /**
   * Checks if the driver can connect to the database. Throws on failure.
   */
  verifyConnection(): Promise<void>;

  /**
   * Closes all database connections and cleans up resources.
   */
  close(): Promise<void>;

  /**
   * Inserts a new job into the queue using the provided arguments and options.
   * @param args - The job arguments to insert.
   * @param opts - Options for job insertion.
   * @returns A promise that resolves to the result of the insertion operation,
   *          including the job and whether the insert was skipped due to uniqueness.
   */
  insert<T extends JobArgs>(args: T, opts: InsertOpts): Promise<InsertResult<T>>;

  /**
   * Inserts a new job into the queue within an existing transaction or session.
   * The type of `tx` is driver-specific and should match the transaction/session type for the driver.
   *
   * @param tx - The transaction or session object to use for the insert.
   * @param args - The job arguments to insert.
   * @param opts - Options for job insertion.
   * @returns A promise that resolves to the result of the insertion operation.
   */
  insertTx<T extends JobArgs>(tx: Tx, args: T, opts: InsertOpts): Promise<InsertResult<T>>;

  /**
   * Inserts multiple jobs in sequence within a single transaction.
   * If any insert fails, all previous inserts in the batch are rolled back.
   *
   * @param jobs - Array of job argument and option pairs to insert.
   * @returns Array of InsertResult objects for each job.
   */
  insertMany<T extends JobArgs>(jobs: { args: T; opts: InsertOpts }[]): Promise<InsertResult<T>[]>;

  /**
   * Starts and returns a new transaction or session object for the driver.
   * The returned object should be used for transactional operations such as insertTx.
   *
   * @returns A promise that resolves to the driver's transaction/session object.
   */
  getTx(): Promise<Tx>;
}
