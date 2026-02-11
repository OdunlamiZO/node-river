/**
 * Interface for job argument objects passed to job handlers.
 *
 * Every job must specify a `kind` to identify its type, and can include
 * any number of additional properties relevant to the job's execution.
 */
export default interface JobArgs {
  /**
   * Identifies the job type for routing and processing.
   */
  kind: string;

  /**
   * Arbitrary job parameters, allowing for flexible job payloads.
   * All values should be JSON-compatible.
   */
  [key: string]: unknown;
}
