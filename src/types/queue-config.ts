/**
 * Configuration for a single queue.
 */
export default interface QueueConfiguration {
  /**
   * Maximum number of jobs that can be processed simultaneously for this queue.
   */
  concurrency: number;
}
