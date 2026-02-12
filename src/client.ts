import { Driver } from './drivers';
import { ClientConfiguration, InsertOpts, Job, JobArgs } from './types';

/**
 * Provides methods to enqueue jobs and manage queue operations.
 */
export class RiverClient {
  private readonly driver: Driver;
  private readonly configuration: ClientConfiguration;

  /**
   * Creates a new RiverClient instance.
   * @param driver - The queue driver implementation.
   * @param configuration - Client configuration options.
   */
  constructor(driver: Driver, configuration: ClientConfiguration) {
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
   * @returns A promise that resolves to the inserted Job.
   */
  insert(args: JobArgs, opts: InsertOpts = {}): Promise<Job> {
    const defaultOpts: InsertOpts = {
      queue: this.configuration.defaultQueue,
      maxAttempts: this.configuration.maxAttempts,
      ...opts,
    };
    return this.driver.insert(args, defaultOpts);
  }
}
