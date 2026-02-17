import Job from './job';
import JobArgs from './job-args';

/**
 * Result of a job insertion operation.
 *
 * - If a unique job already exists, `job` is the existing job and `skipped` is true.
 * - If the job was inserted, `job` is the new job and `skipped` is false.
 */
export default interface InsertResult<T extends JobArgs = JobArgs> {
  /**
   * The inserted job, or the existing job if insertion was skipped due to uniqueness.
   */
  job: Job<T>;

  /**
   * True if insertion was skipped because a unique job already exists.
   */
  skipped: boolean;
}
