import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import RiverClient from '../../../src/client';
import Driver from '../../../src/drivers/driver';
import { Job, JobState, Worker } from '../../../src/types';

// A mock driver with all methods as jest.fn()
function makeMockDriver(): Driver<unknown> {
  return {
    verifyConnection: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn(),
    insertTx: jest.fn(),
    insertMany: jest.fn(),
    getTx: jest.fn(),
    getAvailableJobs: jest.fn().mockResolvedValue([]),
    completeJob: jest.fn().mockResolvedValue(undefined),
    failJob: jest.fn().mockResolvedValue(undefined),
  } as unknown as Driver<unknown>;
}

// A minimal valid Job record
function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    state: JobState.Running,
    attempt: 1,
    maxAttempts: 3,
    attemptedAt: new Date(),
    createdAt: new Date(),
    finalizedAt: null,
    scheduledAt: new Date(),
    priority: 1,
    args: { kind: 'test_job' },
    attemptedBy: ['test-client'],
    errors: null,
    kind: 'test_job',
    metadata: {},
    queue: 'default',
    tags: [],
    uniqueKey: null,
    uniqueStates: null,
    ...overrides,
  };
}

describe('RiverClient worker', () => {
  let driver: Driver<unknown>;
  let client: RiverClient<Driver<unknown>, unknown>;

  beforeEach(() => {
    driver = makeMockDriver();
    // Use a long pollInterval so the timer doesn't re-fire mid-test
    client = new RiverClient(driver, {
      queues: { default: { concurrency: 2 } },
      pollInterval: 60_000,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('calls worker.work() and completeJob when the worker succeeds', async () => {
    const job = makeJob();
    (driver.getAvailableJobs as jest.Mock).mockResolvedValueOnce([job]);

    const jobDone = new Promise<void>((resolve) => {
      (driver.completeJob as jest.Mock).mockImplementationOnce(async () => resolve());
    });

    const worker: Worker = { work: jest.fn().mockResolvedValue(undefined) };
    client.addWorker('test_job', worker);
    client.work();

    await jobDone;

    expect(worker.work).toHaveBeenCalledWith(job);
    expect(driver.completeJob).toHaveBeenCalledWith(job.id);
    expect(driver.failJob).not.toHaveBeenCalled();
  });

  it('calls failJob when the worker throws', async () => {
    const job = makeJob();
    (driver.getAvailableJobs as jest.Mock).mockResolvedValueOnce([job]);

    const jobDone = new Promise<void>((resolve) => {
      (driver.failJob as jest.Mock).mockImplementationOnce(async () => resolve());
    });

    const workerError = new Error('something went wrong');
    const worker: Worker = { work: jest.fn().mockRejectedValue(workerError) };
    client.addWorker('test_job', worker);
    client.work();

    await jobDone;

    expect(driver.failJob).toHaveBeenCalledWith(job.id, workerError, job.attempt, job.maxAttempts);
    expect(driver.completeJob).not.toHaveBeenCalled();
  });

  it('calls failJob with "No worker registered" when no worker is added for the job kind', async () => {
    const job = makeJob({ kind: 'unknown_kind' });
    (driver.getAvailableJobs as jest.Mock).mockResolvedValueOnce([job]);

    const jobDone = new Promise<void>((resolve) => {
      (driver.failJob as jest.Mock).mockImplementationOnce(async () => resolve());
    });

    client.work(); // no worker registered for 'unknown_kind'

    await jobDone;

    const [, error] = (driver.failJob as jest.Mock).mock.calls[0];
    expect(error.message).toMatch(/No worker registered for kind: unknown_kind/);
    expect(driver.completeJob).not.toHaveBeenCalled();
  });

  it('fetches up to the concurrency limit per poll', async () => {
    client = new RiverClient(driver, {
      queues: { default: { concurrency: 5 } },
      pollInterval: 60_000,
    });

    const pollDone = new Promise<void>((resolve) => {
      (driver.getAvailableJobs as jest.Mock).mockImplementationOnce(async () => {
        resolve();
        return [];
      });
    });

    client.work();
    await pollDone;

    expect(driver.getAvailableJobs).toHaveBeenCalledWith('default', 5, expect.any(String));
  });

  it('processes multiple jobs from the same poll concurrently', async () => {
    const jobs = [makeJob({ id: 1 }), makeJob({ id: 2 })];
    (driver.getAvailableJobs as jest.Mock).mockResolvedValueOnce(jobs);

    let completedCount = 0;
    const allDone = new Promise<void>((resolve) => {
      (driver.completeJob as jest.Mock).mockImplementation(async () => {
        if (++completedCount === jobs.length) resolve();
      });
    });

    const worker: Worker = { work: jest.fn().mockResolvedValue(undefined) };
    client.addWorker('test_job', worker);
    client.work();

    await allDone;

    expect(worker.work).toHaveBeenCalledTimes(2);
    expect(driver.completeJob).toHaveBeenCalledWith(1);
    expect(driver.completeJob).toHaveBeenCalledWith(2);
  });
});
