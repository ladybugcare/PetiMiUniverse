// backend/routes/clinics.ts
import express from 'express';
import {
  getClinics,
  getClinicById,
  updateClinic,
  updateClinicPhoto,
  deleteClinic,
  checkCNPJ,
  checkEmail,
  registerClinicWithUnit
} from '../controllers/clinicsController';
import { authenticateUser } from '../middleware/authMiddleware';
import { supabase } from '../config/supabase';
import type { Request, Response } from 'express';
import { createClinicPublic } from '../controllers/clinics/createClinicPublic';
import { checkClinicCnpj } from '../controllers/clinics/checkClinicCnpj';


const router = express.Router();

/**
 * ===========================================================
 * 🏥 FLUXO DE CADASTRO PÚBLICO (sem login)
 * ===========================================================
 */
router.post('/register', createClinicPublic);

/**
 * ===========================================================
 * 🏢 FLUXO INTERNO (clínicas autenticadas)
 * ===========================================================
 */
router.post('/register-with-unit', authenticateUser, registerClinicWithUnit);

/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
router.get('/', getClinics);
router.get('/check-cnpj/:cnpj', checkCNPJ);
router.get('/check-email/:email', checkEmail);
router.get('/check-cnpj/:cnpj', checkClinicCnpj);
router.get('/:id', getClinicById);

/**
 * ===========================================================
 * ✏️ ATUALIZAÇÃO DE DADOS
 * ===========================================================
 */
router.put('/:id', authenticateUser, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, cnpj, phone, address, city, state, status } = req.body;

  try {
    const { data, error } = await supabase
      .from('clinics')
      .update({
        name,
        email,
        cnpj,
        phone,
        address,
        city,
        state,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json({
      success: true,
      message: 'Clínica atualizada com sucesso',
      clinic: data,
    });
  } catch (error: any) {
    console.error('Erro ao atualizar clínica:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao atualizar clínica',
    });
  }
});

/**
 * ===========================================================
 * 🖼️ FOTO E EXCLUSÃO
 * ===========================================================
 */
router.patch('/:id/photo', authenticateUser, updateClinicPhoto);
router.delete('/:id', authenticateUser, deleteClinic);

export default router;
