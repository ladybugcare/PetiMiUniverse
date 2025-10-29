import express from 'express'
import { createClinic, getClinics, getClinicById, updateClinic, deleteClinic, checkCNPJ, checkEmail } from '../controllers/clinicsController'
const router = express.Router()

router.post('/register', createClinic)
router.get('/', getClinics)
router.get('/check-cnpj/:cnpj', checkCNPJ)
router.get('/check-email/:email', checkEmail)
router.get('/:id', getClinicById)
router.patch('/:id', updateClinic)
router.delete('/:id', deleteClinic)

export default router