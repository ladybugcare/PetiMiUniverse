import express from 'express'
import { authenticateUser } from '../middleware/authMiddleware.js'
import { filterApplicationsByRole } from '../middleware/privacyGuard.js'
import { 
  applyToDemand, 
  getApplicationsByDemand,
  getApplicationsByClinic,
  getApplicationsByUnit,
  getPendingApplicationsCount,
  getApplicationsByUser,
  updateApplicationStatus,
  checkConflicts,
  validateConflict
} from '../controllers/applicationsController'

const router = express.Router()

router.post('/apply', authenticateUser, applyToDemand)
// Aplicar privacyGuard em rotas GET para garantir privacidade
router.get('/demand/:demand_id', authenticateUser, filterApplicationsByRole, getApplicationsByDemand)
router.get('/clinic', authenticateUser, filterApplicationsByRole, getApplicationsByClinic)
router.get('/unit/:unitId', authenticateUser, filterApplicationsByRole, getApplicationsByUnit)
router.get('/pending-count', authenticateUser, filterApplicationsByRole, getPendingApplicationsCount)
// Generic route that works for both vets and freelancers
router.get('/user/:userId', authenticateUser, filterApplicationsByRole, getApplicationsByUser)
// Legacy route for backwards compatibility
router.get('/vet/:vetId', authenticateUser, filterApplicationsByRole, getApplicationsByUser)
// Update application status (approve/reject)
router.patch('/:id/status', authenticateUser, updateApplicationStatus)
// Check conflicts for an application
router.get('/:id/conflicts', authenticateUser, checkConflicts)
// Validate conflict before applying
router.post('/validate-conflict', authenticateUser, validateConflict)

export default router
