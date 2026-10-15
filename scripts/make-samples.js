// Writes fake practice files to samples/demo/: a Vehicle Master and a GPS distance report.
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import { demoFleet, rng } from '../prisma/demo-fleet.js';

fs.mkdirSync('samples/demo', { recursive: true });
const fleet = demoFleet();

const master = new ExcelJS.Workbook();
const ms = master.addWorksheet('Vehicles');
ms.addRow(['S.no', 'Register No.', 'Vehicle Type', 'Fuel Type', 'Vehicle Model', 'Vendor / Driver', 'Vendor / Driver Name', 'Vendor / Driver Contact', 'Department', 'Category']).font = { bold: true };
for (const v of fleet) ms.addRow([v.sno, v.number, v.make, v.fuel, v.year, v.vendorDriver, v.name, v.contact, v.department, v.category]);
ms.columns.forEach((c) => (c.width = 18));
await master.xlsx.writeFile('samples/demo/demo-vehicle-master.xlsx');

// GPS report for 1–3 October 2026, in the layout many GPS portals use.
const gps = new ExcelJS.Workbook();
const gs = gps.addWorksheet('Distance Report');
gs.addRow(['Distance Report 01-10-2026 to 03-10-2026']).font = { bold: true };
gs.addRow([]);
gs.addRow(['Sr No', 'Vehicle Name', 'Start Time', 'End Time', 'Start Odometer', 'End Odometer', 'Distance (KM)']).font = { bold: true };
const rand = rng(5);
let sr = 1;
for (const day of ['01', '02', '03']) {
  for (const v of fleet) {
    if (/FREE|WORKSHOP|ACCIDENTAL/.test(v.vendorDriver)) continue;
    const km = Math.round((60 + rand() * 180) * 10) / 10;
    const odo = 20000 + v.sno * 1000;
    gs.addRow([sr++, v.sno % 5 === 0 ? `${v.number} (1)` : v.number, `${day}-10-2026 07:${String(10 + v.sno).slice(-2)}:00`, `${day}-10-2026 21:05:00`, odo, odo + km, km]);
  }
  gs.addRow([sr++, '14936', `${day}-10-2026 08:00:00`, `${day}-10-2026 20:00:00`, 0, 42, 42]); // a device not in the master
}
gs.columns.forEach((c) => (c.width = 20));
await gps.xlsx.writeFile('samples/demo/demo-gps-km-01-to-03-oct-2026.xlsx');
console.log('Written to samples/demo/');
