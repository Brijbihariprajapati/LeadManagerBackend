import { User } from '../models/User.js';
import { signToken } from '../utils/jwt.js';

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const emailNorm = String(email ?? '')
      .trim()
      .toLowerCase();
    if (!emailNorm || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const user = await User.findOne({ email: emailNorm }).select('+password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = signToken(user._id.toString(), user.role);
    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

/** Client clears localStorage; this endpoint is optional for symmetry. */
export function logout(_req, res) {
  return res.json({ success: true, message: 'Logged out' });
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.user.id).select('name email role isActive');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
}
