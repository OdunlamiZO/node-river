import os from 'os';
import process from 'process';
import { clearTimeout, setTimeout } from 'timers';
import { Driver } from './drivers';
import { ClientConfiguration, InsertOpts, InsertResult, Job, JobArgs, Worker } from './types';
import { CLIENT_CONFIGURATION_DEFAULTS } from './utils';

/**
 * RiverClient is the main entry point for interacting with the River job queue.
 * It supports two usage modes:
 * - Insertion only: enqueue jobs without processing them.
 * - Worker mode: register workers and call `work()` to start polling and processing jobs.
 */
export default class RiverClient<D extends Driver<Tx>, Tx> {
  private readonly running: Map<string, number> = new Map();
  private stopped = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly driver: D;
  private readonly configuration: ClientConfiguration;
  private readonly workers: Map<string, Worker> = new Map();
  private readonly clientId: string;

  /**
   * Creates a new RiverClient instance.
   * @param driver - The driver implementation (e.g. PgDriver).
   * @param configuration - Client options: queues, max attempts, poll interval, and client ID.
   */
  constructor(driver: D, configuration: ClientConfiguration) {
    this.driver = driver;
    this.configuration = configuration;
    this.clientId = configuration.clientId ?? `${os.hostname()}-${process.pid}`;
  }

  /**
   * Verifies the driver can reach the database. Throws if the connection fails.
   */
  async verifyConnection(): Promise<void> {
    return this.driver.verifyConnection();
  }

  /**
   * Stops the polling loop (if running) and closes all database connections.
   * Always call this on shutdown to avoid resource leaks.
   */
  async close(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    await this.driver.close();
  }

  /**
   * Inserts a single job into the specified queue.
   * @param args - Job arguments including `kind` and any job-specific fields.
   * @param opts - Insertion options. `queue` is required; `maxAttempts` defaults to the client configuration value.
   * @returns The inserted job and a `skipped` flag indicating if it was deduplicated.
   */
  async insert<T extends JobArgs>(args: T, opts: InsertOpts): Promise<InsertResult<T>> {
    const defaultOpts: InsertOpts = {
      maxAttempts: this.configuration.maxAttempts,
      ...opts,
    };

    return this.driver.insert(args, defaultOpts);
  }

  /**
   * Inserts a single job within an existing transaction. Use this when the job
   * should only be enqueued if the surrounding transaction commits.
   * @param tx - The active transaction object (type is driver-specific).
   * @param args - Job arguments including `kind` and any job-specific fields.
   * @param opts - Insertion options. `queue` is required; `maxAttempts` defaults to the client configuration value.
   * @returns The inserted job and a `skipped` flag indicating if it was deduplicated.
   */
  async insertTx<T extends JobArgs>(tx: Tx, args: T, opts: InsertOpts): Promise<InsertResult<T>> {
    const defaultOpts: InsertOpts = {
      maxAttempts: this.configuration.maxAttempts,
      ...opts,
    };

    return this.driver.insertTx(tx, args, defaultOpts);
  }

  /**
   * Inserts multiple jobs in a single transaction. If any insert fails, all are rolled back.
   * @param jobs - Array of `{ args, opts }` pairs. Each `opts` must include a `queue`.
   * @returns An array of InsertResult objects in the same order as the input.
   */
  async insertMany<T extends JobArgs>(
    jobs: { args: T; opts: InsertOpts }[],
  ): Promise<InsertResult<T>[]> {
    const jobsWithDefaults = jobs.map((job) => ({
      args: job.args,
      opts: {
        maxAttempts: this.configuration.maxAttempts,
        ...job.opts,
      },
    }));

    return this.driver.insertMany(jobsWithDefaults);
  }

  /**
   * Registers a worker for a specific job kind. When a job of this kind is claimed
   * from the queue, the worker's `work()` method will be called with the job.
   * Must be called before `work()` for the worker to receive jobs.
   * @param kind - The job kind string that this worker handles (e.g. `"send_email"`).
   * @param worker - The worker instance that implements the `Worker<T>` interface.
   */
  addWorker<T extends JobArgs>(kind: string, worker: Worker<T>): void {
    this.workers.set(kind, worker);
  }

  /**
   * Begins polling all configured queues and dispatching jobs to registered workers.
   * Each queue is polled independently with its own concurrency limit.
   * No-op if `queues` is not configured.
   */
  work(): void {
    this.stopped = false;
    this.poll();
  }

  private poll(): void {
    if (this.stopped) return;

    this.fetchAndWork().finally(() => {
      this.pollTimer = setTimeout(
        () => this.poll(),
        this.configuration.pollInterval ?? CLIENT_CONFIGURATION_DEFAULTS.pollInterval,
      );
    });
  }

  private async fetchAndWork(): Promise<void> {
    const queues = Object.entries(this.configuration.queues ?? {});

    for (const [queue, queueConfig] of queues) {
      const running = this.running.get(queue) ?? 0;
      const slots = queueConfig.concurrency - running;
      if (slots <= 0) continue;

      const jobs = await this.driver.getAvailableJobs(queue, slots, this.clientId);

      for (const job of jobs) {
        this.running.set(job.queue, (this.running.get(job.queue) ?? 0) + 1);
        this.processJob(job).finally(() => {
          this.running.set(job.queue, Math.max(0, (this.running.get(job.queue) ?? 0) - 1));
        });
      }
    }
  }

  private async processJob(job: Job): Promise<void> {
    const worker = this.workers.get(job.kind);

    if (!worker) {
      await this.driver.failJob(
        job.id,
        new Error(`No worker registered for kind: ${job.kind}`),
        job.attempt,
        job.maxAttempts,
      );
      return;
    }

    try {
      await worker.work(job);
      await this.driver.completeJob(job.id);
    } catch (error) {
      await this.driver.failJob(job.id, error as Error, job.attempt, job.maxAttempts);
    }
  }
}
