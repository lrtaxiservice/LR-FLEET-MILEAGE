// Creates the one Admin if there is none yet. Safe to run on every start.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
try {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) {
    console.log(`Admin already exists (${admin.username}).`);
  } else {
    const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 8) {
      console.error('Set ADMIN_PASSWORD (at least 8 characters) in .env, then run this again.');
      process.exit(1);
    }
    await prisma.user.create({
      data: { username, name: 'Admin', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false },
    });
    await prisma.activityLog.create({ data: { action: 'ADMIN_CREATED', entity: 'user', username } });
    console.log(`Admin "${username}" created.`);
  }
} finally {
  await prisma.$disconnect();
}
