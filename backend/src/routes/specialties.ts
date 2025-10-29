import express from 'express';
import { getSpecialties } from '../controllers/specialtiesController';

const router = express.Router();

router.get('/', getSpecialties);

export default router;

