import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authRouter, loadUser } from './auth';
import { ROOT_DIR, UPLOADS_DIR, type DB } from './db/db';
import { errorHandler, HttpError } from './http';
import { adminRouter } from './routes/admin';
import { businessRouter } from './routes/business';
import { customersRouter } from './routes/customers';
import { enquiriesRouter } from './routes/enquiries';
import { priceItemsRouter } from './routes/priceItems';
import { teamRouter } from './routes/team';

export interface AppOptions {
  uploadsDir?: string;
  /** Serve the built web app (production). */
  serveWeb?: boolean;
}

export function createApp(db: DB, options: AppOptions = {}): Express {
  const uploadsDir = options.uploadsDir ?? UPLOADS_DIR;
  fs.mkdirSync(uploadsDir, { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  // Behind a host's proxy (e.g. Render), set TRUST_PROXY=1 so login rate limits see real visitor IPs.
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 'loopback');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(loadUser(db));

  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', index: false }));

  app.use('/api/auth', authRouter(db));
  app.use('/api/business', businessRouter(db, uploadsDir));
  app.use('/api/price-items', priceItemsRouter(db));
  app.use('/api/customers', customersRouter(db));
  app.use('/api/enquiries', enquiriesRouter(db, uploadsDir));
  app.use('/api/team', teamRouter(db));
  app.use('/api/admin', adminRouter(db));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  if (options.serveWeb) {
    const webDir = path.join(ROOT_DIR, 'dist', 'web');
    app.use(express.static(webDir, { index: false }));
    app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
