import mongoose from 'mongoose';

/**
 * One proposal document per lead. `data` holds arbitrary JSON (Mixed).
 * Schema uses strict: false so additional top-level keys are allowed if needed.
 */
const proposalSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      unique: true,
      index: true,
    },
    /** User who first saved the proposal */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** Last user who saved */
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    /** Full proposal payload (same shape as praposel normalize output + extras) */
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    strict: false,
    timestamps: true,
  }
);

export const Proposal = mongoose.model('Proposal', proposalSchema);
