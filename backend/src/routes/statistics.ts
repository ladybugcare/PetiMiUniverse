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
import {
  getClinicReportsOverview,
  getClinicReportsDemands,
  getClinicReportsProfessionals
} from '../controllers/reportsController';
import { authenticateUser } from '../middleware/authMiddleware';
import { statsLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Aplicar rate limiter mais permissivo para todas as rotas de estatísticas
router.use(statsLimiter);

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

// Clinic reports (for CADMIN role)
router.get('/clinic/:clinicId/reports/overview', authenticateUser, getClinicReportsOverview);
router.get('/clinic/:clinicId/reports/demands', authenticateUser, getClinicReportsDemands);
router.get('/clinic/:clinicId/reports/professionals', authenticateUser, getClinicReportsProfessionals);

export default router;

