import { prisma } from './db.js';

export const DEFAULT_SETTINGS = {
  attentionPercent: 10, // "Needs Attention" = more than this % worse than the benchmark
  minComparable: 3, // fewer comparable vehicles → "Not enough data to compare"
};

export async function getSettings(db = prisma) {
  const rows = await db.setting.findMany({ where: { key: { in: Object.keys(DEFAULT_SETTINGS) } } });
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function getSetting(key, fallback = null, db = prisma) {
  const r = await db.setting.findUnique({ where: { key } });
  return r ? r.value : fallback;
}

export async function setSetting(key, value, db = prisma) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
