import UniqueOpts from './unique-opts';

/**
 * Options for job insertion, such as queue, priority, scheduling, and metadata.
 */
export default interface InsertOpts {
  /**
   * List of tags for grouping and categorizing jobs
   */
  tags?: string[];

  /**
   * Name of the job queue to insert into
   */
  queue?: string;

  /**
   * Job priority (1 = highest, 4 = lowest)
   */
  priority?: number;

  /**
   * Arbitrary metadata for the job
   */
  metadata?: Record<string, unknown>;

  /**
   * Maximum number of attempts before discarding the job
   */
  maxAttempts?: number;

  /**
   * Schedule the job for future execution
   */
  scheduledAt?: Date;

  /**
   * Options relating to job uniqueness.
   * If not set, the job is never treated as unique.
   */
  uniqueOpts?: UniqueOpts;
}
