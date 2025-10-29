import express from 'express';
import { getClinicStats, getVetStats, getSystemStats } from '../controllers/statisticsController';

const router = express.Router();

// Get clinic statistics
router.get('/clinic/:clinicId', getClinicStats);

// Get vet statistics
router.get('/vet/:vetId', getVetStats);

// Get system-wide statistics (admin only)
router.get('/system', getSystemStats);

export default router;

