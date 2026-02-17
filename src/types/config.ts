/**
 * Configuration options for the RiverQueue client.
 */
export default interface ClientConfiguration {
  /**
   * Default queue name for job insertion
   */
  defaultQueue?: string;

  /**
   * Maximum number of attempts for jobs
   */
  maxAttempts?: number;
}
