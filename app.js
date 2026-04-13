import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import leadRoutes from './routes/leadRoutes.js';

const app = express();

/** Behind Railway/Render/etc. so `X-Forwarded-*` is trusted (optional). */
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const primaryOrigin = clientOrigins[0] || 'http://localhost:3000';

app.use(
  cors({
    origin:
      clientOrigins.length <= 1
        ? primaryOrigin
        : (origin, cb) => {
            if (!origin) return cb(null, true);
            if (clientOrigins.includes(origin)) return cb(null, true);
            cb(null, false);
          },
    credentials: true,
  })
);
app.use(express.json());

/**
 * Ensure Mongo is ready before route handlers (required on Vercel serverless).
 * On long-lived `node server.js`, connectDB() is a no-op once connected.
 */
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (e) {
    next(e);
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

export default app;
