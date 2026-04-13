import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';
import { migrateLeadFields } from './scripts/migrateLeadFields.js';

const PORT = process.env.PORT || 5000;

async function start() {
  if (!process.env.JWT_SECRET || !String(process.env.JWT_SECRET).trim()) {
    console.error('FATAL: Set JWT_SECRET in backend/.env (required to sign auth tokens).');
    process.exit(1);
  }
  try {
    await connectDB();
    if (process.env.VERCEL !== '1') {
      await migrateLeadFields().catch((err) => console.warn('[migrateLeadFields]', err.message));
    }
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
}

start();
