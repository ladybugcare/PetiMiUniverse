import express from 'express'
import { createClinic, getClinics, getClinicById, updateClinic, updateClinicPhoto, deleteClinic, checkCNPJ, checkEmail, registerClinicWithUnit } from '../controllers/clinicsController'
import { authenticateUser } from '../middleware/authMiddleware'
const router = express.Router()

router.post('/register', createClinic)
router.post('/register-with-unit', authenticateUser, registerClinicWithUnit)
router.get('/', getClinics)
router.get('/check-cnpj/:cnpj', checkCNPJ)
router.get('/check-email/:email', checkEmail)
router.get('/:id', getClinicById)
router.patch('/:id', updateClinic)
router.patch('/:id/photo', updateClinicPhoto)
router.delete('/:id', deleteClinic)

export default router