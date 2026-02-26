import Job from './job';
import JobArgs from './job-args';

/**
 * Interface for job workers. Implement this for each job kind you want to process.
 * Register instances with `client.addWorker(kind, worker)` before calling `client.work()`.
 * @template T - The shape of the job's arguments.
 */
export default interface Worker<T extends JobArgs = JobArgs> {
  /**
   * Called by the client when a job of the registered kind is claimed from the queue.
   * Throw an error to mark the job as failed; return normally to mark it as completed.
   * @param job - The claimed job including its args, metadata, and attempt info.
   */
  work(job: Job<T>): Promise<void>;
}
