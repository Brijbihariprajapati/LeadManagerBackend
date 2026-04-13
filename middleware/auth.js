import jwt from 'jsonwebtoken';

const getSecret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
};

function tokenFromRequest(req) {
  const auth = req.headers.authorization;
  if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

/**
 * Verifies JWT from `Authorization: Bearer <token>`; attaches req.user { id, role }.
 */
export function authenticate(req, res, next) {
  const token = tokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
}

/**
 * Requires req.user.role to be one of allowed roles.
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}
