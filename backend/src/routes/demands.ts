import express from 'express'
import { 
  createDemand, 
  getDemands, 
  getAllDemands,
  getDemandById,
  updateDemand,
  updateDemandStatus,
  deleteDemand,
  getDemandApplications,
  getRecentActivity, 
  getDemandsByUnit 
} from '../controllers/demandsController'
import { requireActiveClinic } from '../middleware/requireActiveClinic'

const router = express.Router()

// Create demand (requires active clinic)
router.post('/create', requireActiveClinic, createDemand)
router.get('/open', getDemands)
router.get('/all', getAllDemands)
router.get('/recent-activity', getRecentActivity)
router.get('/unit/:unitId', getDemandsByUnit)
router.get('/:id', getDemandById)
router.get('/:id/applications', getDemandApplications)
router.patch('/:id', updateDemand)
router.patch('/:id/status', updateDemandStatus)
router.delete('/:id', deleteDemand)

export default router
