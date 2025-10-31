import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import { getPendingUnits, reviewUnit, createUser, getAdmins } from '../controllers/adminController';

const router = express.Router();

// Get pending units (admin only)
router.get('/pending-units', authenticateUser, getPendingUnits);

// Review unit (approve or reject) - admin only
router.patch('/units/:id/review', authenticateUser, reviewUnit);

// Create new user (admin only)
router.post('/users', authenticateUser, createUser);

// Get all admins (admin only)
router.get('/admins', authenticateUser, getAdmins);

export default router;

