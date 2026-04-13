import mongoose from 'mongoose';

/**
 * Connects to MongoDB using MONGODB_URI from environment.
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}
