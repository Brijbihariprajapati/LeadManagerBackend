import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import * as user from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

router.use(authenticate, authorize('admin'));

router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  user.createUser
);

router.get('/', user.getUsers);
router.get('/:id', [param('id').isMongoId()], validate, user.getUserById);
router.delete('/:id', user.deleteUser);
router.patch('/:id/deactivate', user.deactivateUser);
router.patch('/:id/activate', user.activateUser);
router.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('name').optional().trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
  ],
  validate,
  user.updateUserByAdmin
);

export default router;
