// npm run demo — fills an EMPTY local database with a fake fleet, 45 days of KM and fuel, and 5 demo users.
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from '../server/lib/db.js';
import { todayIST, addDays, eachDay, toDb } from '../server/lib/dates.js';
import { previewMaster, commitMaster, guessMapping } from '../server/services/vehicleMaster.js';
import { demoFleet, DEMO_USERS, rng } from './demo-fleet.js';

const HEADERS = ['S.no', 'Register No.', 'Vehicle Type', 'Fuel Type', 'Vehicle Model', 'Vendor / Driver', 'Vendor / Driver Name', 'Vendor / Driver Contact', 'Department', 'Category'];
const RATE = { PETROL: 94.7, DIESEL: 87.6, CNG: 76.1 };

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo data is for the local database only.');
  if ((await prisma.vehicle.count()) > 0 || (await prisma.fuelEntry.count()) > 0) {
    console.error('The database already has vehicles. Demo data only goes into an empty local database.');
    process.exit(1);
  }
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('Run "npm run seed" first to create the Admin.');
  const req = { user: admin, ip: 'demo' };

  // Users
  const pw = process.env.DEMO_PASSWORD;
  if (!pw || pw.length < 8) throw new Error('Set DEMO_PASSWORD (at least 8 characters) in .env.');
  const hash = await bcrypt.hash(pw, 12);
  const users = {};
  for (const u of DEMO_USERS) {
    users[u.username] = await prisma.user.upsert({ where: { username: u.username }, update: {}, create: { ...u, passwordHash: hash, mustChangePassword: false } });
  }

  // Vehicle Master, through the same import the screen uses
  const today = todayIST();
  const start = addDays(today, -45);
  const fleet = demoFleet();
  const rows = [HEADERS, ...fleet.map((v) => [v.sno, v.number, v.make, v.fuel, v.year, v.vendorDriver, v.name, v.contact, v.department, v.category])];
  const preview = await previewMaster(prisma, { sheet: { rows }, headerRow: 0, headers: HEADERS, mapping: guessMapping(HEADERS) });
  await commitMaster(prisma, req, preview, start, 'demo-vehicle-master.xlsx');

  const vehicles = await prisma.vehicle.findMany();
  const byNo = new Map(vehicles.map((v) => [v.number, v]));
  const rand = rng(11);
  const km = [];
  const fuel = [];
  const yesterday = addDays(today, -1);
  const gaps = new Set([addDays(today, -9), addDays(today, -20)]); // two days with no GPS upload, to show the warning

  for (const f of fleet) {
    const v = byNo.get(f.number.replace(/\s/g, ''));
    const runs = ['DRIVER', 'GOVT DRIVER', 'VENDOR', 'OFFICER', 'PERSONAL'].includes(f.vendorDriver);
    if (!runs) continue;
    // A few vehicles run worse than their model, so "Needs Attention" has something to show.
    const eff = f.sno % 7 === 3 ? 0.72 : 0.92 + rand() * 0.16;
    let sinceFill = 0;
    for (const d of eachDay(start, yesterday)) {
      if (gaps.has(d)) continue;
      const dayKm = Math.round((rand() < 0.08 ? 0 : 70 + rand() * 160) * 10) / 10;
      km.push({ vehicleId: v.id, date: toDb(d), km: dayKm, source: 'UPLOAD', enteredById: users.kmuser.id });
      sinceFill += dayKm;
      if (v.ownership !== 'COMPANY' || sinceFill < 350) continue;
      const amountFor = (q, r) => Math.round(q * r);
      const row = { vehicleId: v.id, fromDate: toDb(d), toDate: toDb(d), enteredById: (f.sno % 2 ? users.fuel1 : users.fuel2).id, station: ['IGL', 'Indian Oil', 'HP', 'Garuda'][f.sno % 4], billNo: `D${f.sno}${d.replace(/-/g, '').slice(4)}` };
      if (v.fuelType === 'ELECTRIC') {
        row.amount = Math.round(sinceFill * f.std / eff);
      } else if (v.fuelType === 'CNG_PETROL') {
        const total = sinceFill / (f.std * eff);
        row.cngKg = Math.round(total * 0.85 * 100) / 100;
        row.petrolL = Math.round(total * 0.15 * 100) / 100;
        row.amount = amountFor(row.cngKg, RATE.CNG) + amountFor(row.petrolL, RATE.PETROL);
      } else {
        const q = Math.round((sinceFill / (f.std * eff)) * 100) / 100;
        const key = { PETROL: 'petrolL', DIESEL: 'dieselL', CNG: 'cngKg' }[v.fuelType];
        row[key] = q;
        row.amount = amountFor(q, RATE[v.fuelType]);
      }
      fuel.push(row);
      sinceFill = 0;
    }
  }
  await prisma.dailyKm.createMany({ data: km });
  await prisma.fuelEntry.createMany({ data: fuel });
  await prisma.activityLog.create({ data: { action: 'DEMO_DATA', username: admin.username, newValue: { vehicles: vehicles.length, kmRows: km.length, fuelEntries: fuel.length } } });
  console.log(`Demo data added: ${vehicles.length} vehicles, ${km.length} KM rows, ${fuel.length} fuel entries, ${DEMO_USERS.length} users.`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
