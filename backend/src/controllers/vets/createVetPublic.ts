import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase';
import { createAuthUser } from '../../utils/createAuthUser';
import crypto from 'crypto';

/**
 * ===========================================================
 * 🩺 Controller: Cadastro público de veterinários
 * ===========================================================
 */
export const createVetPublic = async (req: Request, res: Response) => {
  const { name, crmv, specialties, experience, email, password } = req.body;

  try {
    // 1️⃣ Cria usuário no Auth
    const authUser = await createAuthUser(email, password, name, 'vet');
    const newUserId = authUser.id;

    // 2️⃣ Cria registro em "vets"
    const { data: vet, error: vetError } = await supabase
      .from('vets')
      .insert([
        {
          id: newUserId,
          name,
          crmv,
          specialties,
          experience,
          email,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (vetError || !vet) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(vetError?.message || 'Erro ao criar veterinário');
    }

    return res.status(201).json({
      success: true,
      message: 'Veterinário cadastrado com sucesso!',
      vet,
    });
  } catch (error: any) {
    console.error('Erro ao cadastrar veterinário:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao cadastrar veterinário',
    });
  }
};
