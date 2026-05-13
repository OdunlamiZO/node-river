# node-river

Node.js client for [River](https://riverqueue.com), a Postgres-backed job queue. Supports job insertion and worker-based processing with per-queue concurrency control.

## Installation

```bash
npm install @odunlamizo/node-river
```

## Setup

```ts
import { RiverClient } from '@odunlamizo/node-river';
import { PgDriver } from '@odunlamizo/node-river/drivers/pg';

const driver = new PgDriver({ connectionString: process.env.DATABASE_URL! });

const client = new RiverClient(driver, {
  queues: {
    default: { concurrency: 10 },
    emails: { concurrency: 50 },
  },
  maxAttempts: 3,
});

await client.verifyConnection();
```

## Inserting Jobs

`queue` is required on every insert — there is no default fallback.

```ts
// Single job
const result = await client.insert(
  { kind: 'send_email', to: 'user@example.com' },
  { queue: 'emails' },
);
console.log(result.job); // inserted Job record
console.log(result.skipped); // true if deduplicated

// Multiple jobs in one transaction (all succeed or all roll back)
const results = await client.insertMany([
  { args: { kind: 'send_email', to: 'a@example.com' }, opts: { queue: 'emails' } },
  { args: { kind: 'send_email', to: 'b@example.com' }, opts: { queue: 'emails' } },
]);

// Inside an existing transaction
const tx = await driver.getTx();
try {
  await tx.query('BEGIN');
  await client.insertTx(tx, { kind: 'send_email', to: 'c@example.com' }, { queue: 'emails' });
  await tx.query('COMMIT');
} catch (e) {
  await tx.query('ROLLBACK');
  throw e;
} finally {
  tx.release();
}
```

## Unique Jobs

Use `uniqueOpts` to prevent duplicate jobs from being enqueued.

```ts
// Deduplicate by specific args
await client.insert(
  { kind: 'send_email', to: 'user@example.com' },
  { queue: 'emails', uniqueOpts: { byArgs: ['to'] } },
);

// Deduplicate by queue + args
await client.insert(
  { kind: 'send_email', to: 'user@example.com' },
  { queue: 'emails', uniqueOpts: { byQueue: true, byArgs: ['to'] } },
);

// Deduplicate within a time window (e.g. one per 60-second period)
await client.insert(
  { kind: 'send_email', to: 'user@example.com' },
  { queue: 'emails', uniqueOpts: { byPeriod: 60 }, scheduledAt: new Date() },
);
```

## Processing Jobs (Workers)

Implement the `Worker<T>` interface for each job kind, register it with `addWorker`, then call `work()`. Each queue is polled independently at the configured concurrency limit.

```ts
import { Job, JobArgs, Worker } from '@odunlamizo/node-river/types';

interface SendEmailArgs extends JobArgs<{ to: string }> {
  kind: 'send_email';
}

class SendEmailWorker implements Worker<SendEmailArgs> {
  async work(job: Job<SendEmailArgs>): Promise<void> {
    await sendEmail(job.args.to);
  }
}

client.addWorker('send_email', new SendEmailWorker());
client.work(); // starts polling all configured queues
```

Throwing inside `work()` marks the job as failed. If `attempt < maxAttempts` it is retried with exponential backoff; otherwise it is discarded.

## Shutdown

Always call `close()` on shutdown to drain the poll timer and release database connections.

```ts
process.on('SIGTERM', async () => {
  await client.close();
});
```

## Configuration

| Option             | Type                                      | Description                                                                                   |
| ------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `queues`           | `Record<string, { concurrency: number }>` | Queues to poll and their concurrency limits. Required for `work()`.                           |
| `maxAttempts`      | `number`                                  | Default max attempts for inserted jobs.                                                       |
| `pollInterval`     | `number`                                  | Milliseconds between polls. Defaults to `1000`.                                               |
| `busyPollInterval` | `number`                                  | Milliseconds between polls after a full batch is found. Defaults to `pollInterval`.           |
| `clientId`         | `string`                                  | Unique ID for this client instance. Defaults to `hostname-pid`.                               |

## License

MIT
