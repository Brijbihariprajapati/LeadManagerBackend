import mongoose from 'mongoose';

/** Primary disposition — sales interest (Pending = not yet decided) */
export const INTEREST_VALUES = ['Interested', 'Pending', 'Not Interested'];

/**
 * Deal / next-step stage (real pipeline). When not interested, only "Not pursuing" is used.
 */
export const PIPELINE_VALUES = [
  'Pending',
  'Follow-up',
  'Meeting scheduled',
  'Confirmed',
  'Proposal sent',
  'Negotiation',
  'Closed won',
  'Closed lost',
  'Not pursuing',
];

/** @deprecated Legacy single field — kept for migration reads */
export const LEGACY_LEAD_STATUSES = ['Interested', 'Not Interested', 'Follow-up', 'Pending'];

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    /** Lead source (e.g. Facebook, Google) — visible to everyone. */
    sourceName: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    interest: {
      type: String,
      enum: INTEREST_VALUES,
      default: 'Interested',
    },
    pipeline: {
      type: String,
      enum: PIPELINE_VALUES,
      default: 'Pending',
    },
    /** @deprecated Use interest + pipeline */
    status: {
      type: String,
      enum: LEGACY_LEAD_STATUSES,
    },
    notes: {
      type: String,
      default: '',
      maxlength: 10000,
    },
    /** Internal — only exposed in API to lead creator and admins (not on public endpoints). */
    clientBudget: {
      type: String,
      trim: true,
      default: 'N/A',
      maxlength: 5000,
    },
    /** Internal — only exposed in API to lead creator and admins. */
    ourPitch: {
      type: String,
      trim: true,
      default: 'N/A',
      maxlength: 5000,
    },
    /** User-defined label + value pairs (max 30 per lead) */
    customFields: {
      type: [
        {
          id: { type: String, required: true },
          label: { type: String, trim: true, default: '', maxlength: 120 },
          value: { type: String, trim: true, default: '', maxlength: 2000 },
        },
      ],
      default: [],
      validate: {
        validator(arr) {
          return !arr || arr.length <= 30;
        },
        message: 'At most 30 custom fields allowed',
      },
    },
  },
  { timestamps: true }
);

leadSchema.pre('validate', function pipelineGuard(next) {
  if (this.interest === 'Not Interested') {
    this.pipeline = 'Not pursuing';
  } else if (this.pipeline === 'Not pursuing') {
    this.pipeline = 'Pending';
  }
  next();
});

leadSchema.index({ createdBy: 1 });
leadSchema.index({ interest: 1, pipeline: 1 });
leadSchema.index({ name: 'text', email: 'text', phone: 'text' });

export const Lead = mongoose.model('Lead', leadSchema);
