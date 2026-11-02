import { Router } from 'express';
import AccessRequest from '../../models/AccessRequest.js';
import User from '../../models/User.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function isValidText(value, minLength, maxLength) {
  return typeof value === 'string' && value.trim().length >= minLength && value.trim().length <= maxLength;
}

function isValidPassword(password) {
  return typeof password === 'string' && passwordPattern.test(password);
}

function publicRequest(request) {
  return {
    id: request._id,
    name: request.name,
    email: request.email,
    reason: request.reason,
    status: request.status,
    rejectionReason: request.rejectionReason,
    username: request.username,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };
}

router.post('/', async (req, res) => {
  const { name, email, reason } = req.body ?? {};
  if (
    !isValidText(name, 2, 100) ||
    typeof email !== 'string' ||
    !emailPattern.test(email.trim()) ||
    !isValidText(reason, 10, 1000)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Name, a valid email, and a reason of 10 to 1000 characters are required'
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await AccessRequest.findOne({
    email: normalizedEmail,
    status: { $in: ['pending', 'processing'] }
  });
  if (existing) {
    return res.status(409).json({ success: false, message: 'An access request for this email is already being reviewed' });
  }

  const request = await AccessRequest.create({
    name: name.trim(),
    email: normalizedEmail,
    reason: reason.trim()
  });
  return res.status(201).json({
    success: true,
    message: 'Access request submitted successfully',
    request: publicRequest(request)
  });
});

router.use(authenticateToken, requireRole('admin'));

router.get('/', async (req, res) => {
  const requests = await AccessRequest.find().sort({ createdAt: -1 });
  return res.json({ success: true, requests: requests.map(publicRequest) });
});

router.post('/:requestId/approve', async (req, res) => {
  const request = await AccessRequest.findById(req.params.requestId);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Access request not found' });
  }
  if (request.status === 'approved') {
    const account = request.accountId ? await User.findById(request.accountId) : null;
    return res.json({
      success: true,
      recovered: true,
      message: 'This access request has already been approved',
      account: account ? { id: account._id, username: account.username, role: account.role } : { username: request.username }
    });
  }
  if (request.status === 'processing') {
    const account = request.username ? await User.findOne({ username: request.username }) : null;
    if (account) {
      request.status = 'approved';
      request.accountId = account._id;
      await request.save();
      return res.json({
        success: true,
        recovered: true,
        message: 'Access request approved and account recovered',
        account: { id: account._id, username: account.username, role: account.role }
      });
    }
    request.status = 'pending';
    request.username = undefined;
    await request.save();
    return res.status(409).json({
      success: false,
      message: 'The previous approval did not create an account. Please submit the approval again'
    });
  }
  if (request.status === 'rejected') {
    return res.status(409).json({ success: false, message: 'A rejected access request cannot be approved' });
  }

  const { username, password } = req.body ?? {};
  if (!isValidText(username, 3, 50) || !isValidPassword(password)) {
    return res.status(400).json({
      success: false,
      message: 'A username and a password with at least 8 characters, including a letter and a number, are required'
    });
  }

  const claimed = await AccessRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'processing', username: username.trim() } },
    { new: true }
  );
  if (!claimed) {
    return res.status(409).json({ success: false, message: 'This access request is being processed by another admin' });
  }

  try {
    const account = await User.create({
      username: username.trim(),
      password,
      role: 'petugas',
      mustChangePassword: true
    });
    claimed.status = 'approved';
    claimed.accountId = account._id;
    claimed.username = account.username;
    await claimed.save();
    return res.status(201).json({
      success: true,
      recovered: false,
      message: 'Access request approved and account created',
      account: { id: account._id, username: account.username, role: account.role }
    });
  } catch (error) {
    claimed.status = 'pending';
    await claimed.save();
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username is already in use' });
    }
    throw error;
  }
});

router.post('/:requestId/reject', async (req, res) => {
  const request = await AccessRequest.findById(req.params.requestId);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Access request not found' });
  }
  if (request.status === 'approved') {
    return res.status(409).json({ success: false, message: 'An approved access request cannot be rejected' });
  }
  if (request.status === 'rejected') {
    return res.json({ success: true, message: 'Access request was already rejected' });
  }

  const { rejectionReason = '' } = req.body ?? {};
  if (!isValidText(rejectionReason, 0, 500)) {
    return res.status(400).json({ success: false, message: 'Rejection reason must be at most 500 characters' });
  }
  request.status = 'rejected';
  request.rejectionReason = rejectionReason.trim();
  await request.save();
  return res.json({ success: true, message: 'Access request rejected' });
});

export default router;
