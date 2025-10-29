import express from 'express'
import { createVet, getVets, getVetById, updateVet, updateVetStatus, deleteVet, checkEmail } from '../controllers/vetsController'

const router = express.Router()

router.post('/register', createVet)
router.get('/', getVets)
router.get('/check-email/:email', checkEmail)
router.get('/:id', getVetById)
router.patch('/:id', updateVet)
router.patch('/:id/status', updateVetStatus)
router.delete('/:id', deleteVet)

export default router

