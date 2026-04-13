/**
 * One-time / idempotent: backfill interest + pipeline from legacy status.
 * Safe to run multiple times.
 */
import mongoose from 'mongoose';
import { Lead } from '../models/Lead.js';

export async function migrateLeadFields() {
  const res = await Lead.updateMany(
    {
      $or: [{ interest: { $exists: false } }, { pipeline: { $exists: false } }],
    },
    [
      {
        $set: {
          interest: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'Not Interested'] }, then: 'Not Interested' },
                { case: { $eq: ['$status', 'Pending'] }, then: 'Pending' },
              ],
              default: 'Interested',
            },
          },
        },
      },
      {
        $set: {
          pipeline: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'Not Interested'] }, then: 'Not pursuing' },
                { case: { $eq: ['$status', 'Follow-up'] }, then: 'Follow-up' },
              ],
              default: 'Pending',
            },
          },
        },
      },
    ]
  );
  if (res.modifiedCount > 0) {
    console.log(`[migrateLeadFields] Updated ${res.modifiedCount} lead(s) with interest/pipeline.`);
  }

  const unset = await Lead.updateMany({ assignedTo: { $exists: true } }, { $unset: { assignedTo: '' } });
  if (unset.modifiedCount > 0) {
    console.log(`[migrateLeadFields] Removed assignedTo from ${unset.modifiedCount} lead(s).`);
  }
}

if (process.argv[1]?.includes('migrateLeadFields')) {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/leads';
  await mongoose.connect(uri);
  await migrateLeadFields();
  await mongoose.disconnect();
  process.exit(0);
}
