import request from 'supertest';
import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import { createApp } from '../server/app.js';
import { prisma } from '../server/lib/db.js';

export { prisma };

let app;
export const getApp = () => (app ||= createApp());

/** Empties every table except the append-only activity log. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "correction_requests", "fuel_entries", "daily_km", "km_uploads", "vehicle_driver_history", "vehicle_status_history", "vehicles", "vendors", "drivers", "settings", "session" RESTART IDENTITY CASCADE',
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE id NOT IN (SELECT DISTINCT user_id FROM "activity_log" WHERE user_id IS NOT NULL)`);
}

const hash = bcrypt.hashSync('password123', 4);
let n = 0;
export async function makeUser(role, extra = {}) {
  n++;
  return prisma.user.create({ data: { username: `${role.toLowerCase()}${n}${Date.now() % 100000}`, name: `${role} ${n}`, role, passwordHash: hash, mustChangePassword: false, ...extra } });
}

/** A supertest agent that is logged in as a new user with the given role. */
export async function loginAs(role, extra) {
  const user = await makeUser(role, extra);
  const agent = request.agent(getApp());
  const r = await agent.post('/api/auth/login').send({ username: user.username, password: 'password123' });
  if (r.status !== 200) throw new Error('login failed: ' + JSON.stringify(r.body));
  agent.user = user;
  return agent;
}

/** Builds an .xlsx file in memory from rows of cells. */
export async function xlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const MASTER_HEADERS = ['S.no', 'Register No.', 'Vehicle Type', 'Fuel Type', 'Vehicle Model', 'Vendor / Driver', 'Vendor / Driver Name', 'Vendor / Driver Contact', 'Department', 'Category'];

/** Imports vehicles through the Vehicle Master screen's API. rows: [number, type, fuel, vendorDriver, name, phone] */
export async function importMaster(admin, rows, effectiveDate = '2026-09-01') {
  const file = await xlsx([MASTER_HEADERS, ...rows.map((r, i) => [i + 1, r[0], r[1], r[2], 2022, r[3], r[4] || '', r[5] || '', 'Ops', 'Commercial'])]);
  const res = await admin.post('/api/master/commit').field('effectiveDate', effectiveDate).attach('file', file, 'master.xlsx');
  if (res.status !== 200) throw new Error('master import failed: ' + JSON.stringify(res.body));
  return res.body;
}

export async function vehicleId(number) {
  return (await prisma.vehicle.findUnique({ where: { number } })).id;
}
