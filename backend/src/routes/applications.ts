import express from 'express'
import { 
  applyToDemand, 
  getApplicationsByDemand,
  getApplicationsByClinic,
  getApplicationsByUnit,
  getPendingApplicationsCount
} from '../controllers/applicationsController'

const router = express.Router()

router.post('/apply', applyToDemand)
router.get('/demand/:demand_id', getApplicationsByDemand)
router.get('/clinic', getApplicationsByClinic)
router.get('/unit/:unitId', getApplicationsByUnit)
router.get('/pending-count', getPendingApplicationsCount)

export default router
