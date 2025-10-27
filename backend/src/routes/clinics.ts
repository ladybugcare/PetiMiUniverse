import express from 'express'
import { createClinic, getClinics } from '../controllers/clinicsController'
const router = express.Router()

router.post('/register', createClinic)
router.get('/', getClinics)

export default router