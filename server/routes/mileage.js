import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { h, bad } from '../lib/http.js';
import { requireCan } from '../lib/auth.js';
import { isYmd, todayIST, monthStart, monthEnd, daySpan, dmy, addDays } from '../lib/dates.js';
import { mileageReport, driverReport, missingGpsDays } from '../services/mileage.js';

const r = Router();
r.use(requireCan('reports'));

/** Daily: one date. Monthly: "YYYY-MM". Custom: from–to. */
function period(q) {
  const mode = ['daily', 'monthly', 'custom'].includes(q.mode) ? q.mode : 'monthly';
  let from;
  let to;
  if (mode === 'daily') {
    from = to = isYmd(q.date) ? q.date : addDays(todayIST(), -1);
  } else if (mode === 'monthly') {
    const m = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : todayIST().slice(0, 7);
    from = monthStart(m + '-01');
    to = monthEnd(m + '-01');
  } else {
    from = q.from;
    to = q.to;
    if (!isYmd(from) || !isYmd(to)) throw bad('Choose the From and To dates.');
    if (from > to) throw bad('From must be on or before To.');
    if (daySpan(from, to) > 400) throw bad('Choose at most about one year.');
  }
  return { mode, from, to };
}

r.get(
  '/',
  h(async (req, res) => {
    const p = period(req.query);
    // Today's GPS report is not ready yet, so only days up to yesterday can be missing.
    const lastDay = addDays(todayIST(), -1);
    const [report, missing] = await Promise.all([mileageReport(prisma, p.from, p.to, p), p.from > lastDay ? [] : missingGpsDays(prisma, p.from, p.to > lastDay ? lastDay : p.to)]);
    res.json({ ...report, missingGpsDays: missing });
  }),
);

r.get(
  '/drivers',
  h(async (req, res) => {
    const p = period(req.query);
    res.json(await driverReport(prisma, p.from, p.to));
  }),
);

const FUEL_LABEL = { PETROL: 'Petrol', DIESEL: 'Diesel', CNG_PETROL: 'CNG/Petrol', CNG: 'CNG', ELECTRIC: 'Electric' };

r.get(
  '/export.xlsx',
  h(async (req, res) => {
    const p = period(req.query);
    const [report, drivers] = await Promise.all([mileageReport(prisma, p.from, p.to, p), driverReport(prisma, p.from, p.to)]);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'LR Fleet App';
    const title = `${dmy(p.from)} to ${dmy(p.to)}`;

    const sheet = (name, cols, rows) => {
      const ws = wb.addWorksheet(name);
      ws.addRow([`LR Taxi Services — ${name} — ${title}`]).font = { bold: true, size: 13 };
      ws.addRow([]);
      const head = ws.addRow(cols.map((c) => c[0]));
      head.font = { bold: true };
      head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF2' } }));
      for (const r2 of rows) ws.addRow(cols.map((c) => c[1](r2)));
      cols.forEach((c, i) => (ws.getColumn(i + 1).width = c[2] || 14));
      ws.views = [{ state: 'frozen', ySplit: 3 }];
      return ws;
    };

    sheet(
      'Mileage',
      [
        ['Vehicle No.', (x) => x.number, 14],
        ['Make / Model', (x) => x.make, 16],
        ['Fuel', (x) => FUEL_LABEL[x.fuelType], 11],
        ['Driver(s)', (x) => x.drivers.join(', '), 24],
        ['Department', (x) => x.department || '', 16],
        ['KM', (x) => x.km],
        ['Petrol L', (x) => x.petrol || null],
        ['Diesel L', (x) => x.diesel || null],
        ['CNG kg', (x) => x.cng || null],
        ['Amount ₹', (x) => x.amount || null],
        ['Average', (x) => x.average],
        ['Unit', (x) => x.unit, 11],
        ['Benchmark', (x) => x.benchmark ?? null],
        ['% worse', (x) => x.worseByPercent ?? null],
        ['₹ per km', (x) => x.costPerKm],
        ['Status', (x) => x.statusLabel, 26],
      ],
      report.rows,
    );
    sheet(
      'By driver',
      [
        ['Driver', (x) => x.driver, 22],
        ['Phone', (x) => x.phone || '', 13],
        ['Vehicle No.', (x) => x.number, 14],
        ['Make / Model', (x) => x.make, 16],
        ['Fuel', (x) => FUEL_LABEL[x.fuelType], 11],
        ['KM', (x) => x.km],
        ['Amount ₹', (x) => x.amount || null],
        ['Average', (x) => x.average],
        ['Unit', (x) => x.unit, 11],
        ['Benchmark', (x) => x.benchmark ?? null],
        ['Status', (x) => x.statusLabel, 26],
      ],
      drivers.rows,
    );
    sheet(
      'Vendor - Others',
      [
        ['Vehicle No.', (x) => x.number, 14],
        ['Make / Model', (x) => x.make, 16],
        ['Type', (x) => x.ownership, 11],
        ['Vendor / holder', (x) => x.holder || '', 22],
        ['Contact', (x) => x.holderContact || '', 13],
        ['Department', (x) => x.department || '', 16],
        ['KM', (x) => x.km],
        ['Days with KM', (x) => x.daysWithKm],
      ],
      report.others,
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mileage-${p.from}-to-${p.to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

export default r;
