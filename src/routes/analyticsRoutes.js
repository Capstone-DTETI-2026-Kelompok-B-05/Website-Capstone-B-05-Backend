import { Router } from 'express';
import DetectionEvent from '../../models/DetectionEvent.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

function parseDate(value, field) {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${field} must be a valid date`);
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function filters(query) {
  const filter = {};
  if (query.vehicleType !== undefined) filter.vehicleType = query.vehicleType;
  const from = parseDate(query.from, 'from');
  const to = parseDate(query.to, 'to');
  if (from || to) {
    filter.detectedAt = {};
    if (from) filter.detectedAt.$gte = from;
    if (to) filter.detectedAt.$lte = to;
  }
  return filter;
}

router.get('/history', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '50', 10) || 50, 1), 100);
  const page = Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1);
  const filter = filters(req.query);
  const [events, total] = await Promise.all([
    DetectionEvent.find(filter).sort({ detectedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DetectionEvent.countDocuments(filter)
  ]);

  return res.json({
    success: true,
    events,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

router.get('/statistics', async (req, res) => {
  const filter = filters(req.query);
  const [summary] = await DetectionEvent.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalDetections: { $sum: 1 },
        averageConfidence: { $avg: '$confidence' },
        firstDetectedAt: { $min: '$detectedAt' },
        lastDetectedAt: { $max: '$detectedAt' }
      }
    }
  ]);
  const byVehicleType = await DetectionEvent.aggregate([
    { $match: filter },
    { $group: { _id: '$vehicleType', count: { $sum: 1 }, averageConfidence: { $avg: '$confidence' } } },
    { $sort: { count: -1, _id: 1 } }
  ]);

  return res.json({
    success: true,
    summary: summary ?? {
      totalDetections: 0,
      averageConfidence: 0,
      firstDetectedAt: null,
      lastDetectedAt: null
    },
    byVehicleType
  });
});

export default router;
