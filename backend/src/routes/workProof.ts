import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { requireActiveClinic } from '../middleware/requireActiveClinic.js';
import {
  checkIn,
  checkOut,
  submitReport,
  approveReport,
  getWorkProof,
} from '../controllers/workProofController.js';

const router = express.Router();

// Check-in (vet)
router.post(
  '/demand-applications/:id/checkin',
  authenticateUser,
  checkIn
);

// Check-out (vet)
router.post(
  '/demand-applications/:id/checkout',
  authenticateUser,
  checkOut
);

// Enviar relatório (vet)
router.post(
  '/demand-applications/:id/report',
  authenticateUser,
  submitReport
);

// Aprovar relatório (clínica)
router.post(
  '/demand-applications/:id/approve-report',
  authenticateUser,
  requireActiveClinic,
  approveReport
);

// Obter prova de trabalho
router.get(
  '/demand-applications/:id/work-proof',
  authenticateUser,
  getWorkProof
);

export default router;

