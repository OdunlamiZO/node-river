/**
 * Represents a failed job attempt, including error details and stack trace.
 */
export default interface AttemptError {
  /** Time the error occurred */
  at: string;
  /** Attempt number when the error occurred */
  attempt: number;
  /** Stringified error or panic value */
  error: string;
  /** Stack trace from a job that panicked */
  trace: string;
}
