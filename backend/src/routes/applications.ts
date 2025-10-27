import express from 'express'
import { applyToDemand, getApplicationsByDemand } from '../controllers/applicationsController'

const router = express.Router()

router.post('/apply', applyToDemand)
router.get('/demand/:demand_id', getApplicationsByDemand)

export default router
