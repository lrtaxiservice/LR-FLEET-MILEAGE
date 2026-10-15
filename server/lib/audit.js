import { prisma } from './db.js';

/** JSON-safe copy: Decimals and Dates become plain values. */
function plain(v) {
  if (v == null) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x)));
}

/**
 * Writes one line to the append-only activity log.
 * Pass the transaction client as `db` so the log line is saved together with the change.
 */
export async function logActivity(req, { action, entity, entityId, oldValue, newValue }, db = prisma) {
  await db.activityLog.create({
    data: {
      userId: req?.user?.id ?? null,
      username: req?.user?.username ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId == null ? null : String(entityId),
      oldValue: plain(oldValue),
      newValue: plain(newValue),
      ip: req?.ip ?? null,
    },
  });
}
