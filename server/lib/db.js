import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient();
export { Prisma };

/** Prisma Decimal (or null) → plain number (or null). */
export const num = (v) => (v == null ? null : Number(v));
