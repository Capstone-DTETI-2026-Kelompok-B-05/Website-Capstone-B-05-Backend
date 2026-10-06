import jwt from 'jsonwebtoken';
import { Router } from 'express';
import User from '../../models/User.js';
import { env } from '../config/env.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function isValidPassword(password) {
  return typeof password === 'string' && passwordPattern.test(password);
}

function createToken(user) {
  return jwt.sign(
    { username: user.username, role: user.role },
    env.jwtSecret,
    { subject: user._id.toString(), expiresIn: env.jwtExpiresIn }
  );
}

function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    role: user.role
  };
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const user = await User.findOne({ username: username.trim() });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  return res.json({ success: true, token: createToken(user), user: publicUser(user) });
});

router.put('/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || !isValidPassword(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'Current password and a new password with at least 8 characters, including a letter and a number, are required'
    });
  }

  const user = await User.findById(req.user.id);
  if (!user || !(await user.comparePassword(currentPassword))) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ success: false, message: 'New password must differ from the current password' });
  }

  user.password = newPassword;
  await user.save();
  return res.json({ success: true, message: 'Password updated successfully' });
});

router.post('/users/:userId/password-reset', authenticateToken, requireRole('admin'), async (req, res) => {
  const { newPassword } = req.body ?? {};
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'A new password with at least 8 characters, including a letter and a number, is required'
    });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  user.password = newPassword;
  await user.save();
  return res.json({ success: true, message: 'Password reset successfully' });
});

export default router;
