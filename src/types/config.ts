import QueueConfiguration from './queue-config';

/**
 * Configuration options for the RiverClient.
 */
export default interface ClientConfiguration {
  /**
   * Queues to poll and their per-queue configuration (e.g. concurrency).
   * Only used when `work()` is called. Keys are queue names.
   */
  queues?: Record<string, QueueConfiguration>;

  /**
   * Default maximum number of attempts for inserted jobs before they are discarded.
   */
  maxAttempts?: number;

  /**
   * How often (in milliseconds) the client polls the database for available jobs.
   * Only applies when `work()` is called.
   */
  pollInterval?: number;

  /**
   * Unique identifier for this client instance, recorded in each job's `attemptedBy` list.
   * Defaults to `hostname-pid` (e.g. `"web-server-12345"`).
   */
  clientId?: string;
}
