import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import * as auth from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

router.post(
  '/login',
  [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Use a full email address, e.g. name@company.com')
      .normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  auth.login
);

router.post('/logout', auth.logout);
router.get('/me', authenticate, auth.me);

export default router;
