import { Router } from 'express';
import User from '../../models/User.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function isValidPassword(password) {
  return typeof password === 'string' && passwordPattern.test(password);
}

function publicAccount(user) {
  return {
    id: user._id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

router.use(authenticateToken, requireRole('admin'));

router.get('/', async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  return res.json({ success: true, accounts: users.map(publicAccount) });
});

router.get('/:accountId', async (req, res) => {
  const user = await User.findById(req.params.accountId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }
  return res.json({ success: true, account: publicAccount(user) });
});

router.post('/', async (req, res) => {
  const { username, password, role = 'petugas' } = req.body ?? {};
  if (
    typeof username !== 'string' ||
    !username.trim() ||
    !isValidPassword(password) ||
    !['admin', 'petugas'].includes(role)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Username, a valid password, and a valid role are required'
    });
  }

  try {
    const user = await User.create({ username: username.trim(), password, role });
    return res.status(201).json({ success: true, account: publicAccount(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username is already in use' });
    }
    throw error;
  }
});

router.patch('/:accountId', async (req, res) => {
  const { username, password, role } = req.body ?? {};
  const updates = {};

  if (username !== undefined) {
    if (typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ success: false, message: 'Username must be a non-empty string' });
    }
    updates.username = username.trim();
  }
  if (password !== undefined) {
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: 'Password must contain at least 8 characters, including a letter and a number' });
    }
    updates.password = password;
  }
  if (role !== undefined) {
    if (!['admin', 'petugas'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be admin or petugas' });
    }
    updates.role = role;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'At least one account field is required' });
  }
  if (req.params.accountId === req.user.id && updates.role === 'petugas') {
    return res.status(400).json({ success: false, message: 'An admin cannot remove their own admin role' });
  }

  try {
    const user = await User.findById(req.params.accountId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    Object.assign(user, updates);
    await user.save();
    return res.json({ success: true, account: publicAccount(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username is already in use' });
    }
    throw error;
  }
});

router.delete('/:accountId', async (req, res) => {
  if (req.params.accountId === req.user.id) {
    return res.status(400).json({ success: false, message: 'An admin cannot delete their own account' });
  }

  const user = await User.findByIdAndDelete(req.params.accountId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }
  return res.json({ success: true, message: 'Account deleted successfully' });
});

export default router;
