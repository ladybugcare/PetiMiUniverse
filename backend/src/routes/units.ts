import express from 'express';
import {
  createUnit,
  getUnitsByClinic,
  getUnitById,
  updateUnit,
  deleteUnit,
  getUnitStats,
} from '../controllers/unitsController';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

// Create unit (requires authentication, permission checked in controller)
router.post('/create', authenticateUser, createUnit);

// Get units by clinic ID
router.get('/clinic/:clinic_id', authenticateUser, getUnitsByClinic);

// Get unit statistics
router.get('/:unitId/stats', authenticateUser, getUnitStats);

// Get unit by ID
router.get('/:id', authenticateUser, getUnitById);

// Update unit
router.patch('/:id', authenticateUser, updateUnit);

// Delete unit (soft delete)
router.delete('/:id', authenticateUser, deleteUnit);

export default router;

