import { INTEREST_VALUES, PIPELINE_VALUES } from '../models/Lead.js';

export function formatDisplayLabel(interest, pipeline) {
  if (interest === 'Not Interested') return 'Not interested';
  if (interest === 'Pending') {
    return pipeline === 'Pending' ? 'Interest pending' : `Interest pending · ${pipeline}`;
  }
  return `${interest} · ${pipeline}`;
}

/**
 * Ensures API consumers always get interest + pipeline (+ displayLabel).
 * Maps legacy `status` when new fields are missing.
 */
export function normalizeLeadForApi(doc) {
  if (!doc) return doc;
  const o = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
  const legacy = o.status;

  if (!INTEREST_VALUES.includes(o.interest) || !PIPELINE_VALUES.includes(o.pipeline)) {
    if (legacy === 'Not Interested') {
      o.interest = 'Not Interested';
      o.pipeline = 'Not pursuing';
    } else if (legacy === 'Follow-up') {
      o.interest = 'Interested';
      o.pipeline = 'Follow-up';
    } else if (legacy === 'Interested') {
      o.interest = 'Interested';
      o.pipeline = o.pipeline && PIPELINE_VALUES.includes(o.pipeline) ? o.pipeline : 'Pending';
    } else if (legacy === 'Pending') {
      o.interest = 'Pending';
      o.pipeline = o.pipeline && PIPELINE_VALUES.includes(o.pipeline) ? o.pipeline : 'Pending';
    } else {
      o.interest = INTEREST_VALUES.includes(o.interest) ? o.interest : 'Interested';
      o.pipeline =
        o.pipeline && PIPELINE_VALUES.includes(o.pipeline) ? o.pipeline : 'Pending';
    }
  }

  if (o.interest === 'Not Interested') {
    o.pipeline = 'Not pursuing';
  } else if (o.pipeline === 'Not pursuing') {
    o.pipeline = 'Pending';
  }

  if (!PIPELINE_VALUES.includes(o.pipeline)) {
    o.pipeline = 'Pending';
  }

  o.displayLabel = formatDisplayLabel(o.interest, o.pipeline);

  if (!Array.isArray(o.customFields)) {
    o.customFields = [];
  }

  const na = (v) =>
    v == null || (typeof v === 'string' && v.trim() === '') ? 'N/A' : String(v).trim();
  o.clientBudget = na(o.clientBudget);
  o.ourPitch = na(o.ourPitch);

  o.sourceName = o.sourceName != null ? String(o.sourceName).trim().slice(0, 120) : '';

  return o;
}

export function mapLegacyStatusToFields(status) {
  if (status === 'Not Interested') {
    return { interest: 'Not Interested', pipeline: 'Not pursuing' };
  }
  if (status === 'Follow-up') {
    return { interest: 'Interested', pipeline: 'Follow-up' };
  }
  if (status === 'Interested') {
    return { interest: 'Interested', pipeline: 'Pending' };
  }
  if (status === 'Pending') {
    return { interest: 'Pending', pipeline: 'Pending' };
  }
  return { interest: 'Interested', pipeline: 'Pending' };
}
