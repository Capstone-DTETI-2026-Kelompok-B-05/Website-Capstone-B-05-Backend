import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import { env } from '../config/env.js';

export async function authenticateToken(req, res, next) {
  const authorization = req.get('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Authentication token is required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload !== 'object' || !payload.sub || !payload.role || !payload.username) {
      return res.status(401).json({ success: false, message: 'Invalid authentication token' });
    }
  } catch (error) {
    const message = error.name === 'TokenExpiredError' ? 'Authentication token has expired' : 'Invalid authentication token';
    return res.status(401).json({ success: false, message });
  }

  const user = await User.findById(payload.sub).select('_id username role');
  if (!user) {
    return res.status(401).json({ success: false, message: 'User account is no longer available' });
  }

  req.user = { id: user._id.toString(), username: user.username, role: user.role };
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    return next();
  };
}
