/**
 * Options for enforcing uniqueness constraints on jobs.
 */
export default interface UniqueOpts {
  /**
   * Enforce uniqueness based on job arguments.
   * True for all args, or specify keys to include.
   */
  byArgs?: true | string[];

  /**
   * Enforce uniqueness within a time period (seconds).
   */
  byPeriod?: number;

  /**
   * Enforce uniqueness within each queue.
   */
  byQueue?: true;

  /**
   * Enforce uniqueness across specified job states.
   */
  byState?: string[];

  /**
   * Exclude job kind from uniqueness computation.
   */
  excludeKind?: true;
}
