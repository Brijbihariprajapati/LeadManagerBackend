import jwt from 'jsonwebtoken';

export function signToken(userId, role) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: userId, role }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
