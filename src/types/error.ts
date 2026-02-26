/**
 * Represents the error details recorded for a single failed job attempt.
 */
export default interface AttemptError {
  /**
   * ISO timestamp of when the error occurred.
   */
  at: string;

  /**
   * The attempt number that produced this error.
   */
  attempt: number;

  /**
   * The error message thrown by the worker.
   */
  error: string;

  /**
   * Stack trace of the thrown error, if available.
   */
  trace: string;
}
