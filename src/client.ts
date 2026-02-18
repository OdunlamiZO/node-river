import { Driver } from './drivers';
import { ClientConfiguration, InsertOpts, InsertResult, JobArgs } from './types';

/**
 * Provides methods to enqueue jobs and manage queue operations.
 */
export default class RiverClient<D extends Driver<Tx>, Tx> {
  private readonly driver: D;
  private readonly configuration: ClientConfiguration;

  /**
   * Creates a new RiverClient instance.
   * @param driver - The queue driver implementation.
   * @param configuration - Client configuration options.
   */
  constructor(driver: D, configuration: ClientConfiguration) {
    this.driver = driver;
    this.configuration = configuration;
  }

  /**
   * Checks if the driver can connect to the database. Throws on failure.
   */
  verifyConnection(): Promise<void> {
    return this.driver.verifyConnection();
  }

  /**
   * Closes all database connections and cleans up resources.
   */
  close(): Promise<void> {
    return this.driver.close();
  }

  /**
   * Inserts a job into the queue with the specified arguments and options.
   * @param args - The job arguments to insert.
   * @param opts - Optional insertion options.
   * @returns A promise that resolves to the result of the insertion operation,
   *          including the job and whether the insert was skipped due to uniqueness.
   */
  insert<T extends JobArgs>(args: T, opts: InsertOpts = {}): Promise<InsertResult<T>> {
    const defaultOpts: InsertOpts = {
      queue: this.configuration.defaultQueue,
      maxAttempts: this.configuration.maxAttempts,
      ...opts,
    };

    return this.driver.insert(args, defaultOpts);
  }

  /**
   * Inserts a job into the queue within an existing transaction or session.
   * The transaction type (Tx) is determined by the driver implementation.
   *
   * @param tx - The transaction or session object to use for the insert.
   * @param args - The job arguments to insert.
   * @param opts - Optional insertion options.
   * @returns A promise that resolves to the result of the insertion operation,
   *          including the job and whether the insert was skipped due to uniqueness.
   */
  insertTx<T extends JobArgs>(tx: Tx, args: T, opts: InsertOpts = {}): Promise<InsertResult<T>> {
    const defaultOpts: InsertOpts = {
      queue: this.configuration.defaultQueue,
      maxAttempts: this.configuration.maxAttempts,
      ...opts,
    };

    return this.driver.insertTx(tx, args, defaultOpts);
  }

  /**
   * Inserts multiple jobs in sequence within a single transaction.
   * If any insert fails, all previous inserts in the batch are rolled back.
   *
   * @param jobs - Array of job argument and option pairs to insert.
   * @returns A promise that resolves to an array of InsertResult objects for each job.
   */
  async insertMany<T extends JobArgs>(
    jobs: { args: T; opts: InsertOpts }[],
  ): Promise<InsertResult<T>[]> {
    const jobsWithDefaults = jobs.map((job) => ({
      args: job.args,
      opts: {
        queue: this.configuration.defaultQueue,
        maxAttempts: this.configuration.maxAttempts,
        ...job.opts,
      },
    }));

    return this.driver.insertMany(jobsWithDefaults);
  }
}
