// backend/src/routes/clinics.ts
import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import { supabase } from '../config/supabase';
import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';

// 🏥 Controladores novos (organizados)
import { createClinicPublic } from '../controllers/clinics/createClinicPublic';
import { checkClinicCnpj } from '../controllers/clinics/checkClinicCnpj';
import { getClinics } from '../controllers/clinics/getClinics';
import { getClinicById } from '../controllers/clinics/getClinicById';

// 🧩 Controladores antigos ainda úteis
import {
  updateClinic,
  updateClinicPhoto,
  deleteClinic,
  checkEmail,
  registerClinicWithUnit,
} from '../controllers/clinicsController';

const router = express.Router();

/**
 * ===========================================================
 * 🏥 FLUXO DE CADASTRO PÚBLICO
 * ===========================================================
 */
router.post('/', createClinicPublic);

/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
router.get('/check-cnpj/:cnpj', checkClinicCnpj);


router.get('/check-email/:email', checkEmail);
router.get('/', getClinics);
router.get('/:id', getClinicById);

/**
 * ===========================================================
 * 🏢 FLUXO INTERNO (clínicas autenticadas)
 * ===========================================================
 */
router.post('/register-with-unit', authenticateUser, registerClinicWithUnit);

/**
 * ===========================================================
 * ✏️ ATUALIZAÇÃO DE DADOS
 * ===========================================================
 */
router.put('/:id', authenticateUser, updateClinic);

/**
 * ===========================================================
 * 🖼️ FOTO E EXCLUSÃO
 * ===========================================================
 */
router.patch('/:id/photo', authenticateUser, updateClinicPhoto);
router.delete('/:id', authenticateUser, deleteClinic);

export default router;
