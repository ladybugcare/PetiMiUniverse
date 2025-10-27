import express from 'express'
import { createVet, getVets } from '../controllers/vetsController'

const router = express.Router()

router.post('/register', createVet)
router.get('/', getVets)

export default router

