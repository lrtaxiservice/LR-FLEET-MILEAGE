// npm run backup -- "<connection string>"  → backups/lrfleet-YYYY-MM-DD-HH-MM.dump
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const url = process.argv[2] || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Give the connection string: npm run backup -- "postgresql://..."');
  process.exit(1);
}
const now = new Date();
const p = (n) => String(n).padStart(2, '0');
const name = `lrfleet-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}-${p(now.getMinutes())}.dump`;
fs.mkdirSync('backups', { recursive: true });
const out = path.join('backups', name);

// Look for pg_dump on PATH, then in the usual Windows install folders.
const candidates = ['pg_dump'];
for (const v of ['18', '17', '16']) candidates.push(`C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_dump.exe`);
let done = false;
for (const bin of candidates) {
  const r = spawnSync(bin, ['--format=custom', '--no-owner', '--file', out, url], { stdio: 'inherit' });
  if (r.error?.code === 'ENOENT') continue;
  if (r.status !== 0) {
    console.error('The backup failed. Check the connection string.');
    process.exit(1);
  }
  done = true;
  break;
}
if (!done) {
  console.error('pg_dump was not found. Install the PostgreSQL 17 command-line tools (see README, section 5).');
  process.exit(1);
}
console.log(`Backup saved: ${out}`);
