/**
 * Represents the lifecycle state of a job, such as available, running, completed, or scheduled.
 */
export enum JobState {
  /**
   * Immediately eligible to be worked
   */
  Available = 'available',

  /**
   * Manually cancelled by user; cleaned after a period
   */
  Cancelled = 'cancelled',

  /**
   * Successfully run to completion; cleaned after a period
   */
  Completed = 'completed',

  /**
   * Errored too many times; needs manual intervention
   */
  Discarded = 'discarded',

  /**
   * Waiting for external action; not worked or deleted until moved
   */
  Pending = 'pending',

  /**
   * Errored but will be retried; becomes Available when ready
   */
  Retryable = 'retryable',

  /**
   * Actively running; may need rescue if stuck
   */
  Running = 'running',

  /**
   * Scheduled for future execution; becomes Available when due
   */
  Scheduled = 'scheduled',
}
