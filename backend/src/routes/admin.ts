import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import { getPendingUnits, reviewUnit } from '../controllers/adminController';

const router = express.Router();

// Get pending units (admin only)
router.get('/pending-units', authenticateUser, getPendingUnits);

// Review unit (approve or reject) - admin only
router.patch('/units/:id/review', authenticateUser, reviewUnit);

export default router;

