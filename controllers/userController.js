import { User } from '../models/User.js';

export async function createUser(req, res) {
  try {
    const { name, email, password, role = 'user' } = req.body;
    if (role !== 'user') {
      return res.status(400).json({ success: false, message: 'Only role "user" can be created here' });
    }
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    const user = await User.create({ name, email, password, role: 'user', isActive: true });
    return res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not create user' });
  }
}

export async function getUsers(req, res) {
  try {
    const users = await User.find({ role: 'user' })
      .select('name email role isActive createdAt')
      .sort({ createdAt: -1 });
    return res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load users' });
  }
}

/** Single user (admin) — no password */
export async function getUserById(req, res) {
  try {
    const user = await User.findById(req.params.id).select('name email role isActive createdAt updatedAt');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not load user' });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not delete user' });
  }
}

/** Soft-delete: set isActive to false */
export async function deactivateUser(req, res) {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    }
    const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true }).select(
      'name email role isActive'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, user, message: 'User deactivated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not deactivate user' });
  }
}

export async function activateUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(id, { isActive: true }, { new: true }).select(
      'name email role isActive'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, user, message: 'User activated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not activate user' });
  }
}

/** Admin: update another user’s name, email, and/or password */
export async function updateUserByAdmin(req, res) {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const hasName = name !== undefined && String(name).trim() !== '';
    const hasEmail = email !== undefined && String(email).trim() !== '';
    const hasPassword =
      password !== undefined && password !== null && String(password).trim() !== '';

    if (!hasName && !hasEmail && !hasPassword) {
      return res.status(400).json({ success: false, message: 'Provide name, email, or a new password' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (hasEmail) {
      const nextEmail = String(email).toLowerCase().trim();
      if (nextEmail !== user.email) {
        const taken = await User.findOne({ email: nextEmail, _id: { $ne: id } });
        if (taken) {
          return res.status(409).json({ success: false, message: 'Email already in use' });
        }
        user.email = nextEmail;
      }
    }

    if (hasName) {
      user.name = String(name).trim();
    }

    if (hasPassword) {
      const p = String(password);
      if (p.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      user.password = p;
    }

    await user.save();

    const fresh = await User.findById(id).select('name email role isActive createdAt updatedAt');
    return res.json({
      success: true,
      user: {
        id: fresh._id,
        name: fresh.name,
        email: fresh.email,
        role: fresh.role,
        isActive: fresh.isActive,
        createdAt: fresh.createdAt,
        updatedAt: fresh.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Could not update user' });
  }
}
