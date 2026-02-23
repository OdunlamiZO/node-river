# node-river

Node.js library to support River integration.

## Installation

```bash
npm install @odunlamizo/node-river
```

## Usage

### 1. Setup

```ts
import { RiverClient } from 'node-river';
import { PgDriver } from 'node-river/drivers/pg';

const driver = new PgDriver({ connectionString: process.env.DATABASE_URL! });
const client = new RiverClient(driver, {
  defaultQueue: 'default',
  maxAttempts: 1,
});
```

### 2. Verify Connection

```ts
await client.verifyConnection();
```

### 3. Insert a Job

```ts
const result = await client.insert({ kind: 'sort_args', strings: ['banana', 'apple', 'cherry'] });
console.log(result.job); // Job details
```

### 4. Insert Unique Job

```ts
const result = await client.insert(
  { kind: 'sort_args', strings: ['banana', 'apple', 'cherry'] },
  { uniqueOpts: { byArgs: ['strings'] } },
);
console.log(result.skipped); // true if duplicate
```

### 5. Insert Many Jobs Transactionally

```ts
const jobs = [
  { args: { kind: 'sort_args', strings: ['a', 'b'] }, opts: {} },
  { args: { kind: 'sort_args', strings: ['c', 'd'] }, opts: {} },
];
const results = await client.insertMany(jobs);
console.log(results.length); // 2
```

### 6. Use Transactions

```ts
const tx = await driver.getTx();
try {
  await tx.query('BEGIN');
  const result = await client.insertTx(tx, { kind: 'sort_args', strings: ['x', 'y', 'z'] });
  await tx.query('COMMIT');
} catch (e) {
  await tx.query('ROLLBACK');
  throw e;
} finally {
  tx.release();
}
```

## License

MIT
