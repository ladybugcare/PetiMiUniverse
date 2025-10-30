import express from 'express';
import {
  createUnit,
  getUnitsByClinic,
  getUnitById,
  updateUnit,
  deleteUnit,
  getUnitStats,
  createFirstUnit,
} from '../controllers/unitsController';
import { authenticateUser } from '../middleware/authMiddleware';
import { requireActiveClinic } from '../middleware/requireActiveClinic';

const router = express.Router();

// Create first unit (for new clinics - NO requireActiveClinic middleware)
router.post('/create-first', authenticateUser, createFirstUnit);

// Create unit (requires authentication + active clinic)
router.post('/create', authenticateUser, requireActiveClinic, createUnit);

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

