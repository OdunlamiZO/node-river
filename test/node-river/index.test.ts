import { RiverClient } from '../../src';
import { PgDriver } from '../../src/drivers/pg';

let dbUrl: string | undefined;
let client: RiverClient;

describe('RiverClient Integration', () => {
  let goProcess: {
    pid: number;
  };

  beforeAll((done) => {
    jest.setTimeout(30000);
    // Start the Go engine before running tests
    const { spawn } = require('child_process');

    const path = require('path');
    const fs = require('fs');
    const goEngineDir = path.resolve(__dirname, '../go-engine');

    const dbUrlPath = '/tmp/db-url.json';
    // Remove old file if it exists
    if (fs.existsSync(dbUrlPath)) fs.unlinkSync(dbUrlPath);

    goProcess = spawn('go', ['run', 'main.go'], {
      cwd: goEngineDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    // Poll for the db-url.json file to appear
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
    client = new RiverClient(new PgDriver({ connectionString: dbUrl! }), {});
    await expect(client.verifyConnection()).resolves.not.toThrow();
  });
});
