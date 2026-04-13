import mongoose from 'mongoose';
import {
  Lead,
  INTEREST_VALUES,
  PIPELINE_VALUES,
  LEGACY_LEAD_STATUSES,
} from '../models/Lead.js';
import { Proposal } from '../models/Proposal.js';
import { mapLegacyStatusToFields, normalizeLeadForApi } from '../utils/leadNormalize.js';

function hasContactSafe(email, phone) {
  return Boolean((email && String(email).trim()) || (phone && String(phone).trim()));
}

function respondLead(res, lead) {
  return res.json({ success: true, lead: normalizeLeadForApi(lead) });
}

const populateLead = [{ path: 'createdBy', select: 'name email' }];

const MAX_CUSTOM_FIELDS = 30;

/** Which leads (by id string) have at least one saved proposal — for table columns. */
async function proposalPresenceSetForLeadIds(leadIds) {
  if (!leadIds?.length) return new Set();
  const found = await Proposal.find({ lead: { $in: leadIds } }).distinct('lead');
  return new Set(found.map((id) => String(id)));
}

function csvEscapeCell(val) {
  if (val === undefined || val === null) return '';
  const s = String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function sanitizeCustomFields(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (out.length >= MAX_CUSTOM_FIELDS) break;
    if (!item || typeof item !== 'object') continue;
    const label = String(item.label ?? '').trim().slice(0, 120);
    const value = String(item.value ?? '').trim().slice(0, 2000);
    let id = String(item.id ?? '').trim().slice(0, 80);
    if (!id) id = new mongoose.Types.ObjectId().toString();
    if (!label && !value) continue;
    out.push({ id, label, value });
  }
  return out;
}

/** Works when `createdBy` is an ObjectId or populated `{ _id, name, ... }`. */
function leadCreatorId(lead) {
  const c = lead.createdBy;
  if (c == null) return null;
  if (typeof c === 'object' && c._id != null) return String(c._id);
  return String(c);
}

function assertLeadOwner(lead, user) {
  if (user.role === 'admin') return true;
  if (user.role === 'user') {
    return leadCreatorId(lead) === String(user.id);
  }
  return false;
}

/** List/dashboard: hide internal budget/pitch unless viewer is admin or lead creator. */
function omitBudgetPitchForViewer(normalized, lead, user) {
  if (assertLeadOwner(lead, user)) return normalized;
  const { clientBudget, ourPitch, ...rest } = normalized;
  return rest;
}

function trimBudgetPitchField(v) {
  if (v == null || String(v).trim() === '') return 'N/A';
  return String(v).trim().slice(0, 5000);
}

function trimSourceName(v) {
  if (v == null) return '';
  return String(v).trim().slice(0, 120);
}

export async function createLead(req, res) {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Only users can create leads' });
    }
    const {
      name,
      email,
      phone,
      status,
      notes,
      interest,
      pipeline,
      customFields,
      clientBudget,
      ourPitch,
      sourceName,
    } = req.body;
    if (!hasContactSafe(email, phone)) {
      return res.status(400).json({ success: false, message: 'Provide at least email or phone' });
    }

    let int = INTEREST_VALUES.includes(interest) ? interest : 'Interested';
    let pipe = PIPELINE_VALUES.includes(pipeline) ? pipeline : 'Pending';
    if (status && LEGACY_LEAD_STATUSES.includes(status)) {
      const m = mapLegacyStatusToFields(status);
      int = m.interest;
      pipe = m.pipeline;
    }
    if (int === 'Not Interested') {
      pipe = 'Not pursuing';
    }

    const lead = await Lead.create({
      name,
      email: email || '',
      phone: phone || '',
      createdBy: req.user.id,
      interest: int,
      pipeline: pipe,
      notes: notes || '',
      customFields: sanitizeCustomFields(customFields),
      clientBudget: trimBudgetPitchField(clientBudget),
      ourPitch: trimBudgetPitchField(ourPitch),
      sourceName: trimSourceName(sourceName),
    });
    await lead.populate(populateLead);
    return res.status(201).json({ success: true, lead: normalizeLeadForApi(lead) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not create lead' });
  }
}

/** @deprecated Maps legacy 4-value status to interest + pipeline */
export async function updateLeadStatus(req, res) {
  try {
    if (req.user.role !== 'user' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const { status } = req.body;
    if (!LEGACY_LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const m = mapLegacyStatusToFields(status);
    lead.interest = m.interest;
    lead.pipeline = m.pipeline;
    lead.status = status;
    await lead.save();
    await lead.populate(populateLead);
    return respondLead(res, lead);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not update status' });
  }
}

export async function updateLeadOutcome(req, res) {
  try {
    if (req.user.role !== 'user' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const { interest, pipeline } = req.body;
    if (!INTEREST_VALUES.includes(interest)) {
      return res.status(400).json({ success: false, message: 'Invalid interest' });
    }
    if (!PIPELINE_VALUES.includes(pipeline)) {
      return res.status(400).json({ success: false, message: 'Invalid pipeline stage' });
    }
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    lead.interest = interest;
    lead.pipeline = pipeline;
    await lead.save();
    await lead.populate(populateLead);
    return respondLead(res, lead);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not update outcome' });
  }
}

export async function updateLeadNotes(req, res) {
  try {
    if (req.user.role !== 'user' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const { notes } = req.body;
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    lead.notes = notes ?? '';
    await lead.save();
    await lead.populate(populateLead);
    return respondLead(res, lead);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not update notes' });
  }
}

export async function updateLead(req, res) {
  try {
    if (req.user.role !== 'user' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      status,
      notes,
      interest,
      pipeline,
      customFields,
      clientBudget,
      ourPitch,
      sourceName,
    } = req.body;
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (name !== undefined) lead.name = name;
    if (email !== undefined) lead.email = email;
    if (phone !== undefined) lead.phone = phone;
    if (notes !== undefined) lead.notes = notes;

    if (interest !== undefined && INTEREST_VALUES.includes(interest)) {
      lead.interest = interest;
    }
    if (pipeline !== undefined && PIPELINE_VALUES.includes(pipeline)) {
      lead.pipeline = pipeline;
    }
    if (status !== undefined && LEGACY_LEAD_STATUSES.includes(status)) {
      const m = mapLegacyStatusToFields(status);
      lead.interest = m.interest;
      lead.pipeline = m.pipeline;
      lead.status = status;
    }
    if (customFields !== undefined) {
      lead.customFields = sanitizeCustomFields(customFields);
    }
    if (clientBudget !== undefined) {
      lead.clientBudget = trimBudgetPitchField(clientBudget);
    }
    if (ourPitch !== undefined) {
      lead.ourPitch = trimBudgetPitchField(ourPitch);
    }
    if (sourceName !== undefined) {
      lead.sourceName = trimSourceName(sourceName);
    }

    if (!hasContactSafe(lead.email, lead.phone)) {
      return res.status(400).json({ success: false, message: 'Provide at least email or phone' });
    }
    await lead.save();
    await lead.populate(populateLead);
    return respondLead(res, lead);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not update lead' });
  }
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLeadFilter(reqQuery, user) {
  const { search, status, interest, pipeline, mine, source } = reqQuery;
  const and = [];

  /** Leads created by the current user (used by “Manage my leads”) */
  if (mine === '1' && user?.id) {
    and.push({ createdBy: new mongoose.Types.ObjectId(user.id) });
  }

  if (interest && INTEREST_VALUES.includes(interest)) {
    and.push({ interest });
  }
  if (pipeline && PIPELINE_VALUES.includes(pipeline)) {
    and.push({ pipeline });
  }
  if (!interest && !pipeline && status && LEGACY_LEAD_STATUSES.includes(status)) {
    const m = mapLegacyStatusToFields(status);
    and.push({ interest: m.interest, pipeline: m.pipeline });
  }

  if (search && String(search).trim()) {
    const q = String(search).trim();
    and.push({
      $or: [
        { name: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { phone: new RegExp(q, 'i') },
        { sourceName: new RegExp(q, 'i') },
      ],
    });
  }

  /** Filter by lead source (exact match, case-insensitive). Use `__empty__` for missing/blank source. */
  if (source != null && String(source).trim() !== '') {
    const raw = String(source).trim();
    if (raw === '__empty__') {
      and.push({
        $or: [{ sourceName: '' }, { sourceName: null }, { sourceName: { $exists: false } }],
      });
    } else {
      and.push({ sourceName: new RegExp(`^${escapeRegex(raw)}$`, 'i') });
    }
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { $and: and };
}

export async function getLeads(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = buildLeadFilter(req.query, req.user);

    const [items, total] = await Promise.all([
      Lead.find(filter)
        .populate('createdBy', 'name email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);

    const proposalSet = await proposalPresenceSetForLeadIds(items.map((l) => l._id));
    const leads = items.map((l) => {
      const norm = normalizeLeadForApi(l);
      const row = omitBudgetPitchForViewer(norm, l, req.user);
      return {
        ...row,
        hasProposal: proposalSet.has(String(l._id)),
      };
    });

    return res.json({
      success: true,
      leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load leads' });
  }
}

/** Admin: same metrics as dashboard summary but scoped to leads created by one user */
export async function getUserLeadSummary(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { userId } = req.params;
    const uid = new mongoose.Types.ObjectId(userId);
    const [row] = await Lead.aggregate([
      { $match: { createdBy: uid } },
      { $addFields: effFields },
      {
        $lookup: {
          from: Proposal.collection.collectionName,
          localField: '_id',
          foreignField: 'lead',
          as: '_proposalDocs',
        },
      },
      {
        $addFields: {
          _hasProposal: { $gt: [{ $size: '$_proposalDocs' }, 0] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          interested: {
            $sum: { $cond: [{ $eq: ['$effI', 'Interested'] }, 1, 0] },
          },
          notInterested: {
            $sum: { $cond: [{ $eq: ['$effI', 'Not Interested'] }, 1, 0] },
          },
          interestPending: {
            $sum: { $cond: [{ $eq: ['$effI', 'Pending'] }, 1, 0] },
          },
          followUp: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$effI', ['Interested', 'Pending']] },
                    { $eq: ['$effP', 'Follow-up'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$effI', ['Interested', 'Pending']] },
                    { $eq: ['$effP', 'Pending'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          proposalCreated: {
            $sum: { $cond: ['$_hasProposal', 1, 0] },
          },
        },
      },
    ]);

    const s = row || {};
    return res.json({
      success: true,
      summary: {
        total: s.total || 0,
        interested: s.interested || 0,
        notInterested: s.notInterested || 0,
        interestPending: s.interestPending || 0,
        followUp: s.followUp || 0,
        pending: s.pending || 0,
        proposalCreated: s.proposalCreated || 0,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load user analytics' });
  }
}

export async function getLeadsByUser(req, res) {
  try {
    const { userId } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { page, limit, skip } = parsePagination(req.query);
    const qf = buildLeadFilter(req.query, null);
    const filter =
      Object.keys(qf).length === 0
        ? { createdBy: userId }
        : { $and: [{ createdBy: userId }, qf] };
    const [items, total] = await Promise.all([
      Lead.find(filter)
        .populate('createdBy', 'name email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);
    const proposalSet = await proposalPresenceSetForLeadIds(items.map((l) => l._id));
    const leads = items.map((l) => {
      const norm = normalizeLeadForApi(l);
      const row = omitBudgetPitchForViewer(norm, l, req.user);
      return {
        ...row,
        hasProposal: proposalSet.has(String(l._id)),
      };
    });
    return res.json({
      success: true,
      leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load leads' });
  }
}

/** Shared board: same search/interest/pipeline filters as GET /leads (no `mine` — full org). */
export async function getPublicLeads(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const since = req.query.since ? new Date(req.query.since) : null;
    const fromQuery = buildLeadFilter(req.query, null);
    const parts = [];
    if (Object.keys(fromQuery).length > 0) parts.push(fromQuery);
    if (since && !Number.isNaN(since.getTime())) {
      parts.push({ updatedAt: { $gt: since } });
    }
    const filter =
      parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { $and: parts };
    const [items, total] = await Promise.all([
      Lead.find(filter)
        .select('name email phone sourceName status interest pipeline notes updatedAt createdAt createdBy')
        .populate('createdBy', 'name')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
    ]);
    const proposalSet = await proposalPresenceSetForLeadIds(items.map((l) => l._id));
    const leads = items.map((l) => {
      const n = normalizeLeadForApi(l);
      const createdById =
        l.createdBy && typeof l.createdBy === 'object' && l.createdBy._id != null
          ? String(l.createdBy._id)
          : l.createdBy
            ? String(l.createdBy)
            : null;
      return {
        id: l._id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        sourceName: n.sourceName ?? '',
        interest: n.interest,
        pipeline: n.pipeline,
        displayLabel: n.displayLabel,
        status: n.displayLabel,
        createdByName: l.createdBy?.name || null,
        createdById,
        notes: l.notes ?? '',
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        hasProposal: proposalSet.has(String(l._id)),
      };
    });
    return res.json({
      success: true,
      leads,
      serverTime: new Date().toISOString(),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load public leads' });
  }
}

/**
 * Admin only: download all leads as CSV with every field stored in MongoDB
 * (including notes, budget, pitch, custom fields, legacy status, proposal flag).
 */
export async function exportLeadsFullCsv(req, res) {
  try {
    const items = await Lead.find({})
      .select(
        'name email phone sourceName status interest pipeline notes clientBudget ourPitch customFields createdAt updatedAt createdBy'
      )
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .lean();

    const proposalSet = await proposalPresenceSetForLeadIds(items.map((l) => l._id));

    const headers = [
      'id',
      'name',
      'email',
      'phone',
      'sourceName',
      'interest',
      'pipeline',
      'status_legacy',
      'notes',
      'clientBudget',
      'ourPitch',
      'customFields_json',
      'createdBy_userId',
      'createdBy_name',
      'createdBy_email',
      'hasProposal',
      'createdAt_iso',
      'updatedAt_iso',
    ];

    const lines = [headers.map(csvEscapeCell).join(',')];
    for (const l of items) {
      const createdById =
        l.createdBy && typeof l.createdBy === 'object' && l.createdBy._id != null
          ? String(l.createdBy._id)
          : l.createdBy
            ? String(l.createdBy)
            : '';
      const createdByName =
        l.createdBy && typeof l.createdBy === 'object' ? l.createdBy.name ?? '' : '';
      const createdByEmail =
        l.createdBy && typeof l.createdBy === 'object' ? l.createdBy.email ?? '' : '';

      const customJson =
        Array.isArray(l.customFields) && l.customFields.length > 0
          ? JSON.stringify(l.customFields)
          : '';

      const row = [
        String(l._id),
        l.name ?? '',
        l.email ?? '',
        l.phone ?? '',
        l.sourceName ?? '',
        l.interest ?? '',
        l.pipeline ?? '',
        l.status ?? '',
        l.notes ?? '',
        l.clientBudget ?? '',
        l.ourPitch ?? '',
        customJson,
        createdById,
        createdByName,
        createdByEmail,
        proposalSet.has(String(l._id)) ? 'yes' : 'no',
        l.createdAt ? new Date(l.createdAt).toISOString() : '',
        l.updatedAt ? new Date(l.updatedAt).toISOString() : '',
      ].map(csvEscapeCell);
      lines.push(row.join(','));
    }

    const body = '\uFEFF' + lines.join('\r\n');
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-full-export-${day}.csv"`);
    return res.status(200).send(body);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not export leads' });
  }
}

/** Public: single lead (no auth) */
export async function getPublicLeadById(req, res) {
  try {
    const lead = await Lead.findById(req.params.id)
      .select('name email phone sourceName status interest pipeline notes customFields updatedAt createdAt createdBy')
      .populate('createdBy', 'name')
      .lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    const n = normalizeLeadForApi(lead);
    const createdById =
      lead.createdBy && typeof lead.createdBy === 'object' && lead.createdBy._id != null
        ? String(lead.createdBy._id)
        : lead.createdBy
          ? String(lead.createdBy)
          : null;
    return res.json({
      success: true,
      lead: {
        id: lead._id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        sourceName: n.sourceName ?? '',
        interest: n.interest,
        pipeline: n.pipeline,
        displayLabel: n.displayLabel,
        status: n.displayLabel,
        createdByName: lead.createdBy?.name || null,
        createdById,
        notes: lead.notes ?? '',
        customFields: Array.isArray(lead.customFields) ? lead.customFields : [],
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load lead' });
  }
}

export async function getLeadProposal(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const proposal = await Proposal.findOne({ lead: lead._id })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();
    return res.json({ success: true, proposal });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load proposal' });
  }
}

export async function saveLeadProposal(req, res) {
  try {
    if (req.user.role !== 'user' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const raw = req.body?.data;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return res.status(400).json({ success: false, message: 'Body must include a JSON object in `data`' });
    }
    const doc = await Proposal.findOneAndUpdate(
      { lead: lead._id },
      {
        $set: {
          data: raw,
          updatedBy: req.user.id,
        },
        $setOnInsert: {
          lead: lead._id,
          createdBy: req.user.id,
        },
      },
      { upsert: true, new: true, runValidators: false }
    ).populate('createdBy', 'name email');

    return res.json({
      success: true,
      proposal: {
        _id: doc._id,
        lead: doc.lead,
        data: doc.data,
        createdBy: doc.createdBy,
        updatedBy: doc.updatedBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not save proposal' });
  }
}

export async function getLeadById(req, res) {
  try {
    const lead = await Lead.findById(req.params.id).populate(populateLead);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return res.json({ success: true, lead: normalizeLeadForApi(lead) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load lead' });
  }
}

export async function deleteLead(req, res) {
  try {
    if (req.user.role !== 'user' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (!assertLeadOwner(lead, req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await Lead.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not delete lead' });
  }
}

const effFields = {
  effI: {
    $ifNull: [
      '$interest',
      {
        $switch: {
          branches: [
            { case: { $eq: ['$status', 'Not Interested'] }, then: 'Not Interested' },
            { case: { $eq: ['$status', 'Pending'] }, then: 'Pending' },
          ],
          default: 'Interested',
        },
      },
    ],
  },
  effP: {
    $ifNull: [
      '$pipeline',
      {
        $switch: {
          branches: [
            { case: { $eq: ['$status', 'Not Interested'] }, then: 'Not pursuing' },
            { case: { $eq: ['$status', 'Follow-up'] }, then: 'Follow-up' },
          ],
          default: 'Pending',
        },
      },
    ],
  },
};

/** Build UTC date windows + bucket keys for GET /leads/analytics */
function buildAnalyticsWindow(period) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const day = now.getUTCDate();

  const endOfUtcDay = (d) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

  if (period === 'daily') {
    const end = endOfUtcDay(now);
    const start = new Date(Date.UTC(y, mo, day - 29, 0, 0, 0, 0));
    const keys = [];
    const labels = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      keys.push(d.toISOString().slice(0, 10));
      labels.push(`${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`);
    }
    return { start, end, bucketKeys: keys, bucketLabels: labels };
  }

  if (period === '6m') {
    const start = new Date(Date.UTC(y, mo - 5, 1, 0, 0, 0, 0));
    const end = endOfUtcDay(now);
    const keys = [];
    const labels = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(y, mo - 5 + i, 1));
      keys.push(d.toISOString().slice(0, 7));
      labels.push(d.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
    }
    return { start, end, bucketKeys: keys, bucketLabels: labels };
  }

  if (period === 'monthly') {
    const start = new Date(Date.UTC(y, mo - 11, 1, 0, 0, 0, 0));
    const end = endOfUtcDay(now);
    const keys = [];
    const labels = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(y, mo - 11 + i, 1));
      keys.push(d.toISOString().slice(0, 7));
      labels.push(d.toLocaleString('en-US', { month: 'short', year: '2-digit' }));
    }
    return { start, end, bucketKeys: keys, bucketLabels: labels };
  }

  /* yearly — last 5 calendar years */
  const start = new Date(Date.UTC(y - 4, 0, 1, 0, 0, 0, 0));
  const end = endOfUtcDay(now);
  const keys = [];
  const labels = [];
  for (let i = 0; i < 5; i++) {
    const yy = y - 4 + i;
    keys.push(String(yy));
    labels.push(String(yy));
  }
  return { start, end, bucketKeys: keys, bucketLabels: labels };
}

/** Mongo $group field names for pipeline stage tallies (effP) */
const PL_FIELDS = {
  Pending: 'plPending',
  'Follow-up': 'plFollowUp',
  'Meeting scheduled': 'plMeetingScheduled',
  Confirmed: 'plConfirmed',
  'Proposal sent': 'plProposalSent',
  Negotiation: 'plNegotiation',
  'Closed won': 'plClosedWon',
  'Closed lost': 'plClosedLost',
  'Not pursuing': 'plNotPursuing',
};

function pipelineGroupAccumulator() {
  const o = {};
  for (const stage of PIPELINE_VALUES) {
    o[PL_FIELDS[stage]] = {
      $sum: { $cond: [{ $eq: ['$effP', stage] }, 1, 0] },
    };
  }
  return o;
}

function pipelineCountsFromRow(r) {
  const pipeline = {};
  for (const stage of PIPELINE_VALUES) {
    const k = PL_FIELDS[stage];
    pipeline[stage] = r[k] || 0;
  }
  return pipeline;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseUTCDateStart(s) {
  const m = DATE_ONLY.exec(String(s || '').trim());
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function parseUTCDateEnd(s) {
  const m = DATE_ONLY.exec(String(s || '').trim());
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Custom range: buckets by span — day (≤90d), month (≤450d), else year.
 */
function buildCustomAnalyticsWindow(fromStr, toStr) {
  const from = parseUTCDateStart(fromStr);
  const toEnd = parseUTCDateEnd(toStr);
  if (!from || !toEnd) {
    return { error: 'Use YYYY-MM-DD for from and to' };
  }
  if (from > toEnd) {
    return { error: 'from must be before or equal to to' };
  }
  const maxMs = 5 * 366 * 86400000;
  if (toEnd - from > maxMs) {
    return { error: 'Range too large (max ~5 years)' };
  }

  const dayCount = Math.floor((toEnd - from) / 86400000) + 1;

  if (dayCount <= 90) {
    const keys = [];
    const labels = [];
    const cursor = new Date(from);
    while (cursor <= toEnd) {
      keys.push(cursor.toISOString().slice(0, 10));
      labels.push(`${String(cursor.getUTCMonth() + 1).padStart(2, '0')}/${String(cursor.getUTCDate()).padStart(2, '0')}`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return {
      start: from,
      end: toEnd,
      bucketKeys: keys,
      bucketLabels: labels,
      dateFmt: '%Y-%m-%d',
      granularity: 'day',
    };
  }

  if (dayCount <= 450) {
    const keys = [];
    const labels = [];
    let y = from.getUTCFullYear();
    let mo = from.getUTCMonth();
    const endY = toEnd.getUTCFullYear();
    const endMo = toEnd.getUTCMonth();
    while (y < endY || (y === endY && mo <= endMo)) {
      const d = new Date(Date.UTC(y, mo, 1));
      keys.push(d.toISOString().slice(0, 7));
      labels.push(d.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
      mo++;
      if (mo > 11) {
        mo = 0;
        y++;
      }
    }
    return {
      start: from,
      end: toEnd,
      bucketKeys: keys,
      bucketLabels: labels,
      dateFmt: '%Y-%m',
      granularity: 'month',
    };
  }

  const keys = [];
  const labels = [];
  const startY = from.getUTCFullYear();
  const endY = toEnd.getUTCFullYear();
  for (let yy = startY; yy <= endY; yy++) {
    keys.push(String(yy));
    labels.push(String(yy));
  }
  return {
    start: from,
    end: toEnd,
    bucketKeys: keys,
    bucketLabels: labels,
    dateFmt: '%Y',
    granularity: 'year',
  };
}

/**
 * Time-series analytics (leads created per bucket). User: own leads; Admin: all leads.
 * Query: period = daily | 6m | monthly | yearly  OR  from + to (YYYY-MM-DD, UTC).
 */
export async function getLeadAnalytics(req, res) {
  try {
    const qFrom = req.query.from;
    const qTo = req.query.to;
    let period = req.query.period || 'monthly';
    let window;
    let mode = 'preset';

    if (qFrom != null || qTo != null) {
      if (!qFrom || !qTo) {
        return res.status(400).json({ success: false, message: 'Provide both from and to (YYYY-MM-DD)' });
      }
      const custom = buildCustomAnalyticsWindow(qFrom, qTo);
      if (custom.error) {
        return res.status(400).json({ success: false, message: custom.error });
      }
      window = custom;
      mode = 'custom';
      period = 'custom';
    } else {
      const allowed = ['daily', '6m', 'monthly', 'yearly'];
      if (!allowed.includes(period)) {
        return res.status(400).json({ success: false, message: 'Invalid period' });
      }
      window = buildAnalyticsWindow(period);
    }

    const { start, end, bucketKeys, bucketLabels, dateFmt: dfCustom, granularity: granCustom } = window;

    const match = {
      createdAt: { $gte: start, $lte: end },
    };
    if (req.user.role === 'user') {
      match.createdBy = new mongoose.Types.ObjectId(req.user.id);
    }

    let dateFmt = '%Y-%m';
    if (mode === 'custom') {
      dateFmt = dfCustom;
    } else if (period === 'daily') dateFmt = '%Y-%m-%d';
    else if (period === 'yearly') dateFmt = '%Y';

    const granularity =
      mode === 'custom'
        ? granCustom
        : period === 'daily'
          ? 'day'
          : period === 'yearly'
            ? 'year'
            : 'month';

    const rows = await Lead.aggregate([
      { $match: match },
      { $addFields: effFields },
      {
        $addFields: {
          bucket: {
            $dateToString: { format: dateFmt, date: '$createdAt', timezone: 'UTC' },
          },
        },
      },
      {
        $group: {
          _id: '$bucket',
          total: { $sum: 1 },
          interested: {
            $sum: { $cond: [{ $eq: ['$effI', 'Interested'] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$effI', 'Pending'] }, 1, 0] },
          },
          notInterested: {
            $sum: { $cond: [{ $eq: ['$effI', 'Not Interested'] }, 1, 0] },
          },
          ...pipelineGroupAccumulator(),
        },
      },
    ]);

    const map = Object.fromEntries(rows.map((r) => [r._id, r]));

    const series = bucketKeys.map((key, i) => {
      const r = map[key] || {};
      return {
        key,
        label: bucketLabels[i] ?? key,
        total: r.total || 0,
        interested: r.interested || 0,
        pending: r.pending || 0,
        notInterested: r.notInterested || 0,
        pipeline: pipelineCountsFromRow(r),
      };
    });

    const totals = series.reduce(
      (acc, p) => ({
        total: acc.total + p.total,
        interested: acc.interested + p.interested,
        pending: acc.pending + p.pending,
        notInterested: acc.notInterested + p.notInterested,
      }),
      { total: 0, interested: 0, pending: 0, notInterested: 0 }
    );

    const pipelineTotals = PIPELINE_VALUES.reduce((acc, stage) => {
      acc[stage] = series.reduce((s, row) => s + (row.pipeline[stage] || 0), 0);
      return acc;
    }, {});

    return res.json({
      success: true,
      mode,
      period,
      granularity,
      range: { start: start.toISOString(), end: end.toISOString() },
      series,
      totals: {
        ...totals,
        pipeline: pipelineTotals,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load analytics' });
  }
}

export async function getDashboardSummary(req, res) {
  try {
    const stages = [{ $addFields: effFields }];
    if (req.user.role === 'user') {
      stages.unshift({ $match: { createdBy: new mongoose.Types.ObjectId(req.user.id) } });
    }
    stages.push(
      {
        $lookup: {
          from: Proposal.collection.collectionName,
          localField: '_id',
          foreignField: 'lead',
          as: '_proposalDocs',
        },
      },
      {
        $addFields: {
          _hasProposal: { $gt: [{ $size: '$_proposalDocs' }, 0] },
        },
      },
    );
    const [row] = await Lead.aggregate([
      ...stages,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          interested: {
            $sum: { $cond: [{ $eq: ['$effI', 'Interested'] }, 1, 0] },
          },
          notInterested: {
            $sum: { $cond: [{ $eq: ['$effI', 'Not Interested'] }, 1, 0] },
          },
          interestPending: {
            $sum: { $cond: [{ $eq: ['$effI', 'Pending'] }, 1, 0] },
          },
          followUp: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$effI', ['Interested', 'Pending']] },
                    { $eq: ['$effP', 'Follow-up'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$effI', ['Interested', 'Pending']] },
                    { $eq: ['$effP', 'Pending'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          proposalCreated: {
            $sum: { $cond: ['$_hasProposal', 1, 0] },
          },
        },
      },
    ]);

    const s = row || {};
    return res.json({
      success: true,
      summary: {
        total: s.total || 0,
        interested: s.interested || 0,
        notInterested: s.notInterested || 0,
        interestPending: s.interestPending || 0,
        followUp: s.followUp || 0,
        pending: s.pending || 0,
        proposalCreated: s.proposalCreated || 0,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load summary' });
  }
}
