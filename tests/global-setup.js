// Starts a throw-away PostgreSQL on port 5434 for the tests and applies the migrations.
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const URL = 'postgresql://postgres:postgres@localhost:5434/lrfleet_test';

export default async function setup() {
  const dir = path.resolve('.pgdata-test');
  fs.rmSync(dir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 5434, persistent: false, onLog: () => {},
    createPostgresUser: process.getuid?.() === 0 }); // Postgres refuses to run as root (Linux containers)
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lrfleet_test');
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL }, stdio: 'pipe' });
  return async () => {
    await pg.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
