import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import helmet from 'helmet';
import pg from 'pg';
import { prisma } from './lib/db.js';
import { errorHandler, HttpError } from './lib/http.js';
import { requireLogin } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import vehicleRoutes from './routes/vehicles.js';
import masterRoutes from './routes/master.js';
import kmRoutes from './routes/km.js';
import fuelRoutes from './routes/fuel.js';
import mileageRoutes from './routes/mileage.js';
import correctionRoutes from './routes/corrections.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  const prod = process.env.NODE_ENV === 'production';
  if (prod) app.set('trust proxy', 1); // Railway sits in front of the app

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'https://fonts.gstatic.com'] },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters. Set it in .env.');
  }
  const PgStore = connectPg(session);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  app.locals.sessionPool = pool;
  app.use(
    session({
      name: 'lrfleet.sid',
      store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: process.env.NODE_ENV === 'test' ? false : 900 }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 12 * 60 * 60 * 1000 },
    }),
  );

  // Changes must come from this app's own pages: JSON or file uploads only (simple cross-site forms are refused).
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const type = req.headers['content-type'] || '';
      if (!/^(application\/json|multipart\/form-data)/i.test(type) && req.headers['content-length'] !== '0' && req.headers['content-length']) {
        return next(new HttpError(415, 'Unsupported request.'));
      }
    }
    next();
  });

  // Load the logged-in user on every request.
  app.use('/api', async (req, _res, next) => {
    try {
      if (req.session.userId) {
        const u = await prisma.user.findUnique({ where: { id: req.session.userId } });
        if (u && u.active) req.user = u;
        else req.session.userId = null;
      }
      next();
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', requireLogin);
  app.use('/api/users', userRoutes);
  app.use('/api', vehicleRoutes);
  app.use('/api/master', masterRoutes);
  app.use('/api/km', kmRoutes);
  app.use('/api/fuel', fuelRoutes);
  app.use('/api/mileage', mileageRoutes);
  app.use('/api/corrections', correctionRoutes);
  app.use('/api', adminRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // The built React screens.
  const dist = path.join(here, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
