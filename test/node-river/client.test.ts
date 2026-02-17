jest.setTimeout(40000); // Set timeout to 30 seconds for integration tests, increase as required

import { RiverClient } from '../../src';
import { PgDriver } from '../../src/drivers/pg';

let dbUrl: string | undefined;
let client: RiverClient;

describe('RiverClient Integration', () => {
  let goProcess: {
    pid: number;
  };

  beforeAll((done) => {
    // Start the Go engine before running tests
    const { spawn } = require('child_process');

    const path = require('path');
    const fs = require('fs');
    const goEngineDir = path.resolve(__dirname, '../go-engine');

    const dbUrlPath = '/tmp/db-url.json';
    // Remove old file if it exists
    if (fs.existsSync(dbUrlPath)) fs.unlinkSync(dbUrlPath);

    const mainBinary = path.join(goEngineDir, 'main');
    if (fs.existsSync(mainBinary)) {
      // CI or local build: run the built binary
      goProcess = spawn(mainBinary, [], {
        cwd: goEngineDir,
        stdio: 'inherit',
        detached: true,
      });
    } else {
      // Local dev: fallback to go run main.go
      goProcess = spawn('go', ['run', 'main.go'], {
        cwd: goEngineDir,
        stdio: 'inherit',
        detached: true,
      });
    }

    // Poll for the db-url.json file to appear, with timeout
    const start = Date.now();
    const maxWait = 20000; // 20 seconds
    const pollForDbUrl = () => {
      if (fs.existsSync(dbUrlPath)) {
        const content = fs.readFileSync(dbUrlPath, 'utf8');
        try {
          dbUrl = JSON.parse(content).url;
          process.stdout.write(`[test] Read DB URL from file: ${dbUrl}\n`);
          done();
        } catch (e) {
          process.stderr.write(`[test] Failed to parse DB URL JSON: ${e}\n`);
          done(e);
        }
      } else if (Date.now() - start > maxWait) {
        done(new Error('Timed out waiting for db-url.json'));
      } else {
        setTimeout(pollForDbUrl, 100);
      }
    };
    pollForDbUrl();
  });

  afterAll(async () => {
    // Gracefully close the Postgres connection before stopping the Go engine
    if (client && typeof client.close === 'function') {
      await client.close();
    }
    // Ensure the Go engine is stopped after tests
    if (goProcess && goProcess.pid) {
      process.kill(-goProcess.pid, 'SIGTERM');
    }
  });

  it('should connect to the database', async () => {
    expect(dbUrl).toBeDefined();
    client = new RiverClient(new PgDriver({ connectionString: dbUrl! }), {
      defaultQueue: 'default',
      maxAttempts: 1,
    });
    await expect(client.verifyConnection()).resolves.not.toThrow();
  });

  it('should sort strings and write to temp file', async () => {
    const fs = require('fs');
    const path = '/tmp/sorted-strings.json';
    // Remove old file if it exists
    if (fs.existsSync(path)) fs.unlinkSync(path);

    // Enqueue a sort job
    const unsorted = ['banana', 'apple', 'cherry'];
    await client.insert({ kind: 'sort_args', strings: unsorted });

    // Wait for the file to appear and check contents
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const poll = () => {
        if (fs.existsSync(path)) {
          const content = fs.readFileSync(path, 'utf8');
          try {
            const sorted = JSON.parse(content).sorted;
            expect(sorted).toEqual(['apple', 'banana', 'cherry']);
            resolve(undefined);
          } catch (e) {
            reject(e);
          }
        } else if (Date.now() - start > 10000) {
          reject(new Error('Timed out waiting for sorted-strings.json'));
        } else {
          setTimeout(poll, 100);
        }
      };
      poll();
    });
  });

  it('should insert a job and return InsertResult with job', async () => {
    const unsorted = ['banana', 'apple', 'cherry'];
    const result = await client.insert({ kind: 'sort_args', strings: unsorted });
    expect(result).toHaveProperty('job');
    expect(result.skipped).toBe(false);
    expect(result.job.kind).toBe('sort_args');
    expect(result.job.args.strings).toEqual(unsorted);
  });

  it('should not insert duplicate unique jobs', async () => {
    // Insert a unique sort_args job
    const unsorted = ['banana', 'apple', 'cherry'];
    const first = await client.insert(
      { kind: 'sort_args', strings: unsorted },
      { uniqueOpts: { byArgs: ['strings'] } },
    );
    expect(first.skipped).toBe(false);
    expect(first.job).toBeDefined();

    // Try to insert the same unique job again
    const second = await client.insert(
      { kind: 'sort_args', strings: unsorted },
      { uniqueOpts: { byArgs: ['strings'] } },
    );
    expect(second.skipped).toBe(true);
    expect(second.job).toBeDefined();
    // The job returned should have the same strings as the first one
    expect(second.job.args.strings).toEqual(unsorted);
  });
});
