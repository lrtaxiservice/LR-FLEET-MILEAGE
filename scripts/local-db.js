// Runs PostgreSQL on this PC for the app (port 5433, data in .pgdata/). Keep this window open.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.pgdata');
const first = !fs.existsSync(path.join(dir, 'PG_VERSION'));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 5433, persistent: true, createPostgresUser: process.getuid?.() === 0 });

if (first) await pg.initialise();
await pg.start();
if (first) await pg.createDatabase('lrfleet');
console.log('Database running on port 5433. Keep this window open. Press Ctrl+C to stop.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
