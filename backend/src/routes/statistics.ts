import express from 'express';
import { 
  getClinicStats, 
  getVetStats, 
  getSystemStats,
  getSystemStatsWithPeriod,
  getSystemGrowthTrends,
  getRecentActivity,
  getTopPerformers,
  getSystemInsights
} from '../controllers/statisticsController';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

// Get clinic statistics
router.get('/clinic/:clinicId', getClinicStats);

// Get vet statistics
router.get('/vet/:vetId', getVetStats);

// Get system-wide statistics (admin only)
router.get('/system', authenticateUser, getSystemStats);

// Get system statistics with period filter (admin only)
router.get('/system/period', authenticateUser, getSystemStatsWithPeriod);

// Get system growth trends for charts (admin only)
router.get('/system/growth-trends', authenticateUser, getSystemGrowthTrends);

// Get recent activity unified (admin only)
router.get('/system/recent-activity', authenticateUser, getRecentActivity);

// Get top performers (admin only)
router.get('/system/top-performers', authenticateUser, getTopPerformers);

// Get system insights (admin only)
router.get('/system/insights', authenticateUser, getSystemInsights);

export default router;

