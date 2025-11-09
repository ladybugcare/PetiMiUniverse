import express from 'express'
import { 
  applyToDemand, 
  getApplicationsByDemand,
  getApplicationsByClinic,
  getApplicationsByUnit,
  getPendingApplicationsCount,
  getApplicationsByUser
} from '../controllers/applicationsController'

const router = express.Router()

router.post('/apply', applyToDemand)
router.get('/demand/:demand_id', getApplicationsByDemand)
router.get('/clinic', getApplicationsByClinic)
router.get('/unit/:unitId', getApplicationsByUnit)
router.get('/pending-count', getPendingApplicationsCount)
// Generic route that works for both vets and freelancers
router.get('/user/:userId', getApplicationsByUser)
// Legacy route for backwards compatibility
router.get('/vet/:vetId', getApplicationsByUser)

export default router
