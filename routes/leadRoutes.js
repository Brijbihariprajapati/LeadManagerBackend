import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as lead from '../controllers/leadController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  INTEREST_VALUES,
  PIPELINE_VALUES,
  LEGACY_LEAD_STATUSES,
} from '../models/Lead.js';

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

router.use(authenticate);

/** Shared board — signed-in users only (admin + user) */
router.get(
  '/public',
  authorize('admin', 'user'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('since').optional().isISO8601(),
    query('search').optional().trim(),
    query('interest').optional().isIn(INTEREST_VALUES),
    query('pipeline').optional().isIn(PIPELINE_VALUES),
    query('status').optional().isIn(LEGACY_LEAD_STATUSES),
    query('source').optional().trim().isLength({ max: 128 }),
  ],
  validate,
  lead.getPublicLeads
);

router.get(
  '/public/:id',
  authorize('admin', 'user'),
  [param('id').isMongoId()],
  validate,
  lead.getPublicLeadById
);

router.get('/dashboard/summary', lead.getDashboardSummary);

router.get(
  '/analytics',
  [
    query('period').optional().isIn(['daily', '6m', 'monthly', 'yearly']),
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  ],
  validate,
  lead.getLeadAnalytics
);

/** Admin: CSV export of every lead with all stored fields (full DB snapshot). */
router.get('/export/full', authorize('admin'), lead.exportLeadsFullCsv);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(LEGACY_LEAD_STATUSES),
    query('interest').optional().isIn(INTEREST_VALUES),
    query('pipeline').optional().isIn(PIPELINE_VALUES),
    query('mine').optional().isIn(['0', '1']),
    query('search').optional().trim(),
    query('source').optional().trim().isLength({ max: 128 }),
  ],
  validate,
  lead.getLeads
);

router.get(
  '/user/:userId/summary',
  authorize('admin'),
  [param('userId').isMongoId()],
  validate,
  lead.getUserLeadSummary
);

router.get(
  '/user/:userId',
  authorize('admin', 'user'),
  [
    param('userId').isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(LEGACY_LEAD_STATUSES),
    query('interest').optional().isIn(INTEREST_VALUES),
    query('pipeline').optional().isIn(PIPELINE_VALUES),
    query('search').optional().trim(),
    query('source').optional().trim().isLength({ max: 128 }),
  ],
  validate,
  lead.getLeadsByUser
);

router.get(
  '/:id/proposal',
  [param('id').isMongoId()],
  validate,
  lead.getLeadProposal
);

router.post(
  '/:id/proposal',
  authorize('admin', 'user'),
  [param('id').isMongoId()],
  validate,
  lead.saveLeadProposal
);

router.get('/:id', [param('id').isMongoId()], validate, lead.getLeadById);

router.post(
  '/',
  authorize('user'),
  [
    body('name').trim().notEmpty(),
    body('email').optional().trim(),
    body('phone').optional().trim(),
    body('status').optional().isIn(LEGACY_LEAD_STATUSES),
    body('interest').optional().isIn(INTEREST_VALUES),
    body('pipeline').optional().isIn(PIPELINE_VALUES),
    body('notes').optional().isString(),
    body('customFields').optional().isArray(),
  ],
  validate,
  lead.createLead
);

router.patch(
  '/:id/outcome',
  authorize('admin', 'user'),
  [
    param('id').isMongoId(),
    body('interest').isIn(INTEREST_VALUES),
    body('pipeline').isIn(PIPELINE_VALUES),
  ],
  validate,
  lead.updateLeadOutcome
);

router.patch(
  '/:id/status',
  authorize('admin', 'user'),
  [param('id').isMongoId(), body('status').isIn(LEGACY_LEAD_STATUSES)],
  validate,
  lead.updateLeadStatus
);

router.patch(
  '/:id/notes',
  authorize('admin', 'user'),
  [param('id').isMongoId(), body('notes').optional().isString().isLength({ max: 10000 })],
  validate,
  lead.updateLeadNotes
);

router.patch(
  '/:id',
  authorize('admin', 'user'),
  [
    param('id').isMongoId(),
    body('name').optional().trim().notEmpty(),
    body('email').optional().trim(),
    body('phone').optional().trim(),
    body('status').optional().isIn(LEGACY_LEAD_STATUSES),
    body('interest').optional().isIn(INTEREST_VALUES),
    body('pipeline').optional().isIn(PIPELINE_VALUES),
    body('notes').optional().isString(),
    body('customFields').optional().isArray(),
  ],
  validate,
  lead.updateLead
);

router.delete(
  '/:id',
  authorize('admin', 'user'),
  [param('id').isMongoId()],
  validate,
  lead.deleteLead
);

export default router;
