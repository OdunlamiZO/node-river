import { InsertOpts, JobArgs } from '../types';
import InsertResult from '../types/insert-result';

/**
 * Common interface for all RiverQueue drivers (pg, Prisma, Sequelize, etc.).
 */
export default interface Driver {
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
}
