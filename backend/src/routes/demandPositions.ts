import express from 'express';
import {
  createCompositeDemand,
  getAvailablePositions,
  applyToPosition,
  acceptApplication,
  rejectApplication,
  getPositionApplications,
  getDemandWithPositions,
  getVetApplications,
  cancelApplication,
} from '../controllers/demandPositionsController';

const router = express.Router();

// Criar demanda composta com posições
router.post('/composite', createCompositeDemand);

// Listar posições disponíveis
router.get('/available', getAvailablePositions);

// Candidatar-se a uma posição
router.post('/apply', applyToPosition);

// Gerenciar candidaturas (Admin/Clínica)
router.patch('/applications/:application_id/accept', acceptApplication);
router.patch('/applications/:application_id/reject', rejectApplication);

// Obter candidaturas de uma posição
router.get('/positions/:position_id/applications', getPositionApplications);

// Obter demanda com suas posições
router.get('/demands/:demand_id/positions', getDemandWithPositions);

// Obter candidaturas do veterinário
router.get('/vets/:vet_id/applications', getVetApplications);

// Cancelar candidatura (pelo vet)
router.patch('/applications/:application_id/cancel', cancelApplication);

export default router;

