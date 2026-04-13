import mongoose from 'mongoose';

/**
 * Reuse connection across Vercel serverless invocations (avoids exhausting Atlas limits).
 */
const globalForMongoose = globalThis;
if (!globalForMongoose.__mongooseConn) {
  globalForMongoose.__mongooseConn = { promise: null };
}
const g = globalForMongoose.__mongooseConn;

const connectOptions = {
  serverSelectionTimeoutMS: 15_000,
  socketTimeoutMS: 45_000,
  maxPoolSize: 10,
};

/**
 * Connects to MongoDB using MONGODB_URI from environment.
 * Safe to call multiple times (idempotent).
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment');
  }
  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!g.promise) {
    g.promise = mongoose
      .connect(uri, connectOptions)
      .then(() => mongoose.connection)
      .catch((err) => {
        g.promise = null;
        throw err;
      });
  }
  await g.promise;
  console.log('MongoDB connected');
  return mongoose.connection;
}
