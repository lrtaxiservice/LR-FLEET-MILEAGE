// GPS KM upload: read the portal's distance report for a From–To range, match vehicles, save daily KM.
import { readWorkbook, biggestSheet, findHeaderRow, cellText, parseNumber } from '../lib/excel.js';
import { parseDateCell, datesInText, eachDay, toDb, fromDb, daySpan, isYmd } from '../lib/dates.js';
import { normPlate } from '../lib/plate.js';
import { logActivity } from '../lib/audit.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { bad } from '../lib/http.js';
import { num } from '../lib/db.js';

export const MAX_UPLOAD_DAYS = 62;
export const KM_FIELDS = [
  { key: 'vehicle', label: 'Vehicle / device name', required: true },
  { key: 'km', label: 'Distance (KM)', required: true },
  { key: 'date', label: 'Start Time / date' },
];

const KEYWORDS = /vehicle|device|reg|number|name|km|kms|distance|kilomet|start|time|date|travel|run/i;
const NOT_KM = /odo|start|end|open|clos|speed|avg|average|max|min|idle|time|hour|hrs|fuel|lat|long|^s\.?\s*no|serial|^sr|^id$|imei|stop|halt|count/i;

export function guessKmMapping(headers) {
  const h = headers.map((x) => String(x ?? '').trim());
  const find = (re, skip = []) => h.findIndex((x, i) => !skip.includes(i) && re.test(x));
  let vehicle = find(/vehicle\s*(no|number|name)?$|^vehicle|reg(istration)?\s*no|plate|device\s*name/i);
  if (vehicle < 0) vehicle = find(/device|asset|unit|^name$/i);
  let km = h.findIndex((x, i) => i !== vehicle && /distance|^kms?\b|kilomet|travell?ed|running|run\s*km/i.test(x) && !NOT_KM.test(x));
  if (km < 0) km = h.findIndex((x, i) => i !== vehicle && /km/i.test(x) && !NOT_KM.test(x));
  let date = find(/start\s*time/i, [vehicle, km]);
  if (date < 0) date = find(/^date|date$|^day$|start/i, [vehicle, km]);
  return { vehicle, km, date };
}

export function checkRange(from, to, today) {
  if (!isYmd(from) || !isYmd(to)) throw bad('Choose the From and To dates.');
  if (from > to) throw bad('From must be on or before To.');
  if (to > today) throw bad('The To date cannot be in the future.');
  if (daySpan(from, to) > MAX_UPLOAD_DAYS) throw bad(`Upload at most ${MAX_UPLOAD_DAYS} days at a time.`);
}

export async function openKmFile(buffer, fileName, mapping) {
  const sheet = biggestSheet(readWorkbook(buffer, fileName));
  const hr = findHeaderRow(sheet.rows, KEYWORDS);
  const headers = (sheet.rows[hr] || []).map(cellText);
  let map = mapping;
  if (!map) {
    const saved = await getSetting('kmMapping');
    if (saved && saved.vehicle && headers.includes(saved.vehicle) && headers.includes(saved.km)) {
      map = { vehicle: headers.indexOf(saved.vehicle), km: headers.indexOf(saved.km), date: saved.date ? headers.indexOf(saved.date) : -1 };
    } else map = guessKmMapping(headers);
  }
  // A single date in the lines above the header ("Distance report for 12-10-2026") is the fallback date.
  const titleDates = [...new Set(sheet.rows.slice(0, hr).flatMap((r) => r.flatMap((c) => datesInText(cellText(c)))))];
  return { sheet, headerRow: hr, headers, mapping: map, titleDate: titleDates.length === 1 ? titleDates[0] : null };
}

/**
 * Reads the KM rows. Trips of the same vehicle on the same day are added together.
 * Returns the vehicle-days to save, what was dropped, and which vehicle-days already have KM.
 */
export async function previewKm(db, file, from, to) {
  const { sheet, headerRow, headers, mapping, titleDate } = file;
  if (!(mapping.vehicle >= 0)) throw bad('Choose the column with the vehicle / device name.');
  if (!(mapping.km >= 0)) throw bad('Choose the column with the distance (KM).');

  const vehicles = await db.vehicle.findMany({ select: { id: true, number: true } });
  const byNo = new Map(vehicles.map((v) => [v.number, v]));
  const fallbackDate = titleDate || (from === to ? from : null);

  const days = new Map(); // "vehicleId|date" → { vehicleId, number, date, km }
  const dropped = new Map(); // device name → rows
  const counts = { rows: 0, outside: 0, noDate: 0, noKm: 0, dropped: 0 };

  for (const r of sheet.rows.slice(headerRow + 1)) {
    const device = cellText(r[mapping.vehicle]);
    if (!device || /^(grand\s*)?total/i.test(device)) continue;
    counts.rows++;
    const km = parseNumber(r[mapping.km]);
    if (km == null || km < 0) {
      counts.noKm++;
      continue;
    }
    const date = (mapping.date >= 0 && parseDateCell(r[mapping.date])) || fallbackDate;
    if (!date) {
      counts.noDate++;
      continue;
    }
    if (date < from || date > to) {
      counts.outside++;
      continue;
    }
    const v = byNo.get(normPlate(device));
    if (!v) {
      counts.dropped++;
      const name = device.replace(/\s*\(\d+\)\s*$/, '');
      dropped.set(name, (dropped.get(name) || 0) + 1);
      continue;
    }
    const k = `${v.id}|${date}`;
    const d = days.get(k) || days.set(k, { vehicleId: v.id, number: v.number, date, km: 0 }).get(k);
    d.km = Math.round((d.km + km) * 100) / 100;
  }

  const list = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.number < b.number ? -1 : 1));
  const withData = new Set(list.map((d) => d.date));
  const missingDays = [...eachDay(from, to)].filter((d) => !withData.has(d));

  const existing = list.length
    ? await db.dailyKm.findMany({ where: { vehicleId: { in: [...new Set(list.map((d) => d.vehicleId))] }, date: { gte: toDb(from), lte: toDb(to) } } })
    : [];
  const have = new Map(existing.map((e) => [`${e.vehicleId}|${fromDb(e.date)}`, e]));
  const duplicates = [];
  const same = [];
  for (const d of list) {
    const e = have.get(`${d.vehicleId}|${d.date}`);
    if (!e) continue;
    if (num(e.km) === d.km) same.push(d);
    else duplicates.push({ ...d, existingKm: num(e.km), existingId: e.id });
  }

  return {
    headers,
    mapping,
    titleDate,
    from,
    to,
    counts: { ...counts, vehicleDays: list.length, newDays: list.length - duplicates.length - same.length, duplicates: duplicates.length, same: same.length },
    days: list,
    dropped: [...dropped.entries()].map(([device, rows]) => ({ device, rows })).sort((a, b) => b.rows - a.rows),
    missingDays,
    duplicates,
  };
}

/**
 * Saves the upload. Vehicle-days that already have KM are skipped unless listed in `replace`.
 * The Admin's replacements are applied at once; anyone else's go to the Admin as requests.
 */
export async function commitKm(db, req, preview, fileName, replace = []) {
  const wantReplace = new Set(replace);
  const isAdmin = req.user.role === 'ADMIN';
  const dupByKey = new Map(preview.duplicates.map((d) => [`${d.vehicleId}|${d.date}`, d]));
  const result = { saved: 0, replaced: 0, requested: 0, skipped: 0, same: preview.counts.same };

  const upload = await db.$transaction(
    async (tx) => {
      const up = await tx.kmUpload.create({
        data: { fileName, fromDate: toDb(preview.from), toDate: toDb(preview.to), userId: req.user.id },
      });
      const fresh = [];
      for (const d of preview.days) {
        const key = `${d.vehicleId}|${d.date}`;
        const dup = dupByKey.get(key);
        if (!dup) {
          const exists = await tx.dailyKm.findUnique({ where: { vehicleId_date: { vehicleId: d.vehicleId, date: toDb(d.date) } } });
          if (!exists) fresh.push({ vehicleId: d.vehicleId, date: toDb(d.date), km: d.km, source: 'UPLOAD', uploadId: up.id, enteredById: req.user.id });
          continue; // identical value already saved
        }
        if (!wantReplace.has(key)) {
          result.skipped++;
          continue;
        }
        if (isAdmin) {
          const old = await tx.dailyKm.findUnique({ where: { id: dup.existingId } });
          await tx.dailyKm.update({
            where: { id: old.id },
            data: { km: d.km, source: 'UPLOAD', uploadId: up.id, enteredById: req.user.id, prevKm: old.km, prevUploadId: old.uploadId, prevSource: old.source },
          });
          await logActivity(req, { action: 'KM_REPLACE', entity: 'daily_km', entityId: old.id, oldValue: { vehicle: d.number, date: d.date, km: num(old.km) }, newValue: { km: d.km, uploadId: up.id } }, tx);
          result.replaced++;
        } else {
          const r = await tx.correctionRequest.create({
            data: {
              type: 'KM_REPLACE',
              targetId: dup.existingId,
              payload: { vehicleId: d.vehicleId, number: d.number, date: d.date, oldKm: dup.existingKm, newKm: d.km, uploadId: up.id },
              reason: `GPS upload ${fileName}`,
              requestedBy: req.user.id,
            },
          });
          await logActivity(req, { action: 'REQUEST_CREATE', entity: 'correction_request', entityId: r.id, newValue: r.payload }, tx);
          result.requested++;
        }
      }
      if (fresh.length) await tx.dailyKm.createMany({ data: fresh });
      result.saved = fresh.length;
      const summary = { ...result, dropped: preview.dropped, missingDays: preview.missingDays, counts: preview.counts };
      const saved = await tx.kmUpload.update({ where: { id: up.id }, data: { rowsSaved: result.saved + result.replaced, rowsSkipped: result.skipped, summary } });
      await logActivity(req, { action: 'KM_UPLOAD', entity: 'km_upload', entityId: up.id, newValue: { fileName, from: preview.from, to: preview.to, ...result } }, tx);
      return saved;
    },
    { timeout: 120000, maxWait: 10000 },
  );

  await setSetting('kmMapping', {
    vehicle: preview.headers[preview.mapping.vehicle],
    km: preview.headers[preview.mapping.km],
    date: preview.mapping.date >= 0 ? preview.headers[preview.mapping.date] : null,
  });
  return { uploadId: upload.id, ...result };
}

/** Removes everything a whole upload saved. Values it replaced are put back. */
export async function undoUpload(db, req, uploadId) {
  return db.$transaction(async (tx) => {
    const up = await tx.kmUpload.findUnique({ where: { id: uploadId } });
    if (!up) throw bad('Upload not found.');
    if (up.undoneAt) throw bad('This upload was already undone.');
    const rows = await tx.dailyKm.findMany({ where: { uploadId } });
    let removed = 0;
    let restored = 0;
    for (const r of rows) {
      if (r.prevKm != null) {
        await tx.dailyKm.update({ where: { id: r.id }, data: { km: r.prevKm, uploadId: r.prevUploadId, source: r.prevSource || 'UPLOAD', prevKm: null, prevUploadId: null, prevSource: null } });
        restored++;
      } else {
        await tx.dailyKm.delete({ where: { id: r.id } });
        removed++;
      }
    }
    // Replace requests from this upload can no longer be applied.
    const pending = await tx.correctionRequest.findMany({ where: { state: 'PENDING', type: 'KM_REPLACE' } });
    for (const p of pending.filter((p) => p.payload?.uploadId === uploadId)) {
      await tx.correctionRequest.update({ where: { id: p.id }, data: { state: 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: 'Upload was undone' } });
    }
    await tx.kmUpload.update({ where: { id: uploadId }, data: { undoneAt: new Date(), undoneById: req.user.id } });
    await logActivity(req, { action: 'KM_UPLOAD_UNDO', entity: 'km_upload', entityId: uploadId, oldValue: { rows: rows.length }, newValue: { removed, restored } }, tx);
    return { removed, restored };
  });
}
