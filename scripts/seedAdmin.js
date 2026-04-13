/**
 * Creates the first admin user from env (run once).
 * Usage: npm run seed
 * Requires: MONGODB_URI, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/User.js';

async function seed() {
  const uri = process.env.MONGODB_URI;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Admin';

  if (!uri || !email || !password) {
    console.error('Set MONGODB_URI, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const existing = await User.findOne({ email });
  if (existing) {
    console.log('Admin already exists:', email);
    await mongoose.disconnect();
    process.exit(0);
  }

  await User.create({
    name,
    email,
    password,
    role: 'admin',
    isActive: true,
  });
  console.log('Admin user created:', email);
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
