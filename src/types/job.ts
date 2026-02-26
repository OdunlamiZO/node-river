import { Buffer } from 'buffer';
import { JobState } from './enums';
import AttemptError from './error';
import JobArgs from './job-args';

/**
 * A job record as stored in the database.
 * @template T - The shape of the job's arguments.
 */
export default interface Job<T extends JobArgs = JobArgs> {
  /**
   * Auto-generated unique job ID.
   */
  id: number;

  /**
   * Current lifecycle state (e.g. available, running, completed).
   */
  state: JobState;

  /**
   * How many times this job has been attempted so far.
   */
  attempt: number;

  /**
   * Maximum attempts allowed before the job is discarded.
   */
  maxAttempts: number;

  /**
   * Timestamp of the most recent attempt, null if never attempted.
   */
  attemptedAt: Date | null;

  /**
   * Timestamp of when the job record was created.
   */
  createdAt: Date;

  /**
   * Timestamp of when the job was finalized (completed or discarded), null if still active.
   */
  finalizedAt: Date | null;

  /**
   * Timestamp of when the job becomes eligible for processing.
   */
  scheduledAt: Date;

  /**
   * Processing priority. Lower numbers run first (1 = highest, 4 = lowest).
   */
  priority: number;

  /**
   * Typed job arguments, decoded from the JSON stored in the database.
   */
  args: T;

  /**
   * List of client IDs that have attempted this job, in order. Null if never attempted.
   */
  attemptedBy: string[] | null;

  /**
   * Error details for each failed attempt, ordered earliest to latest. Null if no failures.
   */
  errors: AttemptError[] | null;

  /**
   * The job kind string used to route it to the correct worker (e.g. `"send_email"`).
   */
  kind: string;

  /**
   * Arbitrary key-value metadata attached to the job at insertion.
   */
  metadata: Record<string, unknown>;

  /**
   * The queue this job belongs to.
   */
  queue: string;

  /**
   * Tags for grouping or filtering jobs.
   */
  tags: string[];

  /**
   * Hashed uniqueness key. Null if the job was not inserted with uniqueness options.
   */
  uniqueKey: Buffer | null;

  /**
   * The job states considered when enforcing uniqueness. Null if not set.
   */
  uniqueStates: JobState[] | null;
}
