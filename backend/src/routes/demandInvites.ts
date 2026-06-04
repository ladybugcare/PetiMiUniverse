import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { requireActiveClinic } from '../middleware/requireActiveClinic.js';
import {
  inviteVet,
  acceptInvite,
  rejectInvite,
  getPendingInvites,
} from '../controllers/demandInvitesController.js';

const router = express.Router();

// Convidar vet para demanda (apenas clínica)
router.post(
  '/demands/:id/invite-vet',
  authenticateUser,
  requireActiveClinic,
  inviteVet
);

// Aceitar convite (vet)
router.post(
  '/demand-applications/:id/accept-invite',
  authenticateUser,
  acceptInvite
);

// Recusar convite (vet)
router.post(
  '/demand-applications/:id/reject-invite',
  authenticateUser,
  rejectInvite
);

// Listar convites pendentes (vet)
router.get(
  '/demand-applications/invites/pending',
  authenticateUser,
  getPendingInvites
);

export default router;

