"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const statisticsController_1 = require("../controllers/statisticsController");
const reportsController_1 = require("../controllers/reportsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Get clinic statistics
router.get('/clinic/:clinicId', statisticsController_1.getClinicStats);
// Get vet statistics
router.get('/vet/:vetId', statisticsController_1.getVetStats);
// Get system-wide statistics (admin only)
router.get('/system', authMiddleware_1.authenticateUser, statisticsController_1.getSystemStats);
// Get system statistics with period filter (admin only)
router.get('/system/period', authMiddleware_1.authenticateUser, statisticsController_1.getSystemStatsWithPeriod);
// Get system growth trends for charts (admin only)
router.get('/system/growth-trends', authMiddleware_1.authenticateUser, statisticsController_1.getSystemGrowthTrends);
// Get recent activity unified (admin only)
router.get('/system/recent-activity', authMiddleware_1.authenticateUser, statisticsController_1.getRecentActivity);
// Get top performers (admin only)
router.get('/system/top-performers', authMiddleware_1.authenticateUser, statisticsController_1.getTopPerformers);
// Get system insights (admin only)
router.get('/system/insights', authMiddleware_1.authenticateUser, statisticsController_1.getSystemInsights);
// Clinic reports (for CADMIN role)
router.get('/clinic/:clinicId/reports/overview', authMiddleware_1.authenticateUser, reportsController_1.getClinicReportsOverview);
router.get('/clinic/:clinicId/reports/demands', authMiddleware_1.authenticateUser, reportsController_1.getClinicReportsDemands);
router.get('/clinic/:clinicId/reports/professionals', authMiddleware_1.authenticateUser, reportsController_1.getClinicReportsProfessionals);
exports.default = router;
