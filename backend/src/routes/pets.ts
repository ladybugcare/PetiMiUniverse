
import { Router } from 'express';
import { createPet, getPets } from '../controllers/petsController'

const router = Router();

router.post('/register', createPet);
router.get('/', getPets);

export default router;