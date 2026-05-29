import type { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import { normalizeCNPJ } from '../../utils/cnpjUtils.js';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError } from '../../utils/errors.js';
import { ensureDefaultGroupJobFunctions } from './hubServiceGroupsController.js';

function resolveHubWebUrl(): string {
  const raw =
    process.env.HUB_WEB_URL?.trim() ||
    process.env.VITE_HUB_WEB_URL?.trim() ||
    process.env.FRONTEND_URL?.trim();
  if (!raw) {
    throw new ValidationError('HUB_WEB_URL não configurada no servidor');
  }
  return raw.replace(/\/$/, '');
}

const hubSignupBodySchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional().nullable(),
});

const clinicBlockSchema = z.object({
  name: z.string().trim().min(2).max(300),
  cnpj: z.string().trim().min(14).max(20),
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(2),
  phone: z.string().trim().max(30).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});

const unitBlockSchema = z.object({
  name: z.string().trim().min(2).max(300),
  nickname: z.string().trim().min(1).max(100),
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(2),
  phone: z.string().trim().max(30).optional().nullable(),
  is_main: z.boolean().optional().default(true),
  technical_manager: z.string().trim().min(2).max(200),
});

const hubOnboardingBodySchema = z.object({
  clinic: clinicBlockSchema,
  unit: unitBlockSchema,
});

async function ensureClinicUserForSignup(userId: string) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('clinic_users')
    .select('id, status, clinic_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from('clinic_users').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      clinic_id: null,
      unit_id: null,
      role: 'CADMIN',
      status: 'pending_clinic',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    return;
  }

  if (existing.clinic_id) return;

  const { error: updateError } = await supabaseAdmin
    .from('clinic_users')
    .update({
      clinic_id: null,
      unit_id: null,
      role: 'CADMIN',
      status: 'pending_clinic',
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (updateError) throw updateError;
}

/** POST /api/hub/signup — cadastro da pessoa (admin futuro da clínica). */
export const postHubSignup = asyncHandler(async (req: Request, res: Response) => {
  const parsed = hubSignupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { full_name, email, password, phone } = parsed.data;
  const hubWebUrl = resolveHubWebUrl();
  const emailRedirectTo = `${hubWebUrl}/email-confirmed`;
  const isLocalEnv = hubWebUrl.includes('localhost') || hubWebUrl.includes('127.0.0.1');

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: isLocalEnv,
    user_metadata: {
      role: 'clinic',
      name: full_name,
      full_name,
      phone: phone?.trim() || null,
    },
  });

  if (authError || !authData?.user) {
    const msg = authError?.message || 'Erro ao criar usuário';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return res.status(409).json({ error: 'Este e-mail já está registado.' });
    }
    return res.status(400).json({ error: msg });
  }

  const userId = authData.user.id;

  try {
    if (!isLocalEnv) {
      await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email: email.trim().toLowerCase(),
        password,
        options: { redirectTo: emailRedirectTo },
      });
    }

    await ensureClinicUserForSignup(userId);
  } catch (e) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw e;
  }

  res.status(201).json({
    success: true,
    message: isLocalEnv
      ? 'Conta criada. Pode iniciar sessão.'
      : 'Conta criada. Confirme o e-mail para continuar.',
    user_id: userId,
    email_confirmed: isLocalEnv,
    needs_onboarding: true,
  });
});

/** POST /api/hub/onboarding/clinic — clínica + primeira unidade (transação lógica). */
export const postHubOnboardingClinic = asyncHandler(async (req: Request, res: Response) => {
  const parsed = hubOnboardingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const userId = req.user!.id;
  const userEmail = req.user!.email || null;
  const { clinic: clinicInput, unit: unitInput } = parsed.data;

  const clinicCnpj = normalizeCNPJ(clinicInput.cnpj);
  if (!clinicCnpj || clinicCnpj.length !== 14) {
    throw new ValidationError('CNPJ inválido');
  }

  const { data: clinicUser, error: clinicUserError } = await supabaseAdmin
    .from('clinic_users')
    .select('id, role, clinic_id, status')
    .eq('user_id', userId)
    .eq('role', 'CADMIN')
    .maybeSingle();

  if (clinicUserError || !clinicUser) {
    return res.status(403).json({ error: 'Sem permissão para concluir o cadastro da clínica.' });
  }

  if (clinicUser.clinic_id) {
    return res.status(400).json({ error: 'Cadastro da clínica já foi concluído.' });
  }

  const { data: cnpjTaken } = await supabaseAdmin
    .from('clinics')
    .select('id')
    .eq('cnpj', clinicCnpj)
    .maybeSingle();

  if (cnpjTaken) {
    return res.status(409).json({ error: 'CNPJ já registado noutra clínica.' });
  }

  const finalClinicId = userId;

  const { data: newClinic, error: createClinicError } = await supabaseAdmin
    .from('clinics')
    .insert({
      id: finalClinicId,
      name: clinicInput.name,
      cnpj: clinicCnpj,
      address: clinicInput.address,
      city: clinicInput.city,
      state: clinicInput.state.toUpperCase(),
      phone: clinicInput.phone?.trim() || null,
      description: clinicInput.description?.trim() || null,
      email: userEmail,
      status: 'pending_unit',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (createClinicError) {
    if (createClinicError.code === '23505') {
      return res.status(409).json({ error: 'Clínica ou CNPJ já existente.' });
    }
    return res.status(500).json({ error: 'Erro ao criar clínica.' });
  }

  const nickname = unitInput.nickname.trim();
  const { data: existingNick } = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('clinic_id', finalClinicId)
    .eq('nickname', nickname)
    .maybeSingle();

  if (existingNick) {
    await supabaseAdmin.from('clinics').delete().eq('id', finalClinicId);
    return res.status(400).json({ error: 'Já existe uma unidade com este apelido.' });
  }

  const { data: unit, error: unitError } = await supabaseAdmin
    .from('units')
    .insert({
      clinic_id: finalClinicId,
      name: unitInput.name,
      nickname,
      address: unitInput.address,
      city: unitInput.city,
      state: unitInput.state.toUpperCase(),
      phone: unitInput.phone?.trim() || null,
      is_main: unitInput.is_main !== false,
      technical_manager: unitInput.technical_manager.trim(),
      status: 'active',
    })
    .select()
    .single();

  if (unitError) {
    await supabaseAdmin.from('clinics').delete().eq('id', finalClinicId);
    return res.status(500).json({ error: 'Erro ao criar unidade.' });
  }

  await supabaseAdmin
    .from('clinics')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', finalClinicId);

  const nowIso = new Date().toISOString();
  const { data: updatedCu, error: updateCuError } = await supabaseAdmin
    .from('clinic_users')
    .update({
      clinic_id: finalClinicId,
      unit_id: unit.id,
      status: 'active',
      first_login_completed_at: nowIso,
      onboarding_state: {
        last_step: 'unit',
        completed: true,
        completed_at: nowIso,
        source: 'hub_onboarding',
      },
      updated_at: nowIso,
    })
    .eq('id', clinicUser.id)
    .select()
    .single();

  if (updateCuError || !updatedCu) {
    await supabaseAdmin.from('units').delete().eq('id', unit.id);
    await supabaseAdmin.from('clinics').delete().eq('id', finalClinicId);
    return res.status(500).json({ error: 'Erro ao vincular utilizador à clínica.' });
  }

  try {
    await ensureDefaultGroupJobFunctions(finalClinicId);
  } catch (bootstrapErr) {
    console.warn('[hub_onboarding] ensureDefaultGroupJobFunctions', bootstrapErr);
  }

  const metadata = extractRequestMetadata(req);
  await createAuditLog({
    user_id: userId,
    clinic_id: finalClinicId,
    unit_id: unit.id,
    action: 'HUB_ONBOARDING_CLINIC',
    entity_type: 'unit',
    entity_id: unit.id,
    new_values: { clinic: newClinic, unit },
    ...metadata,
  });

  res.status(201).json({
    clinic: newClinic,
    unit,
    clinicUser: updatedCu,
    message: 'Clínica e unidade registadas com sucesso.',
  });
});
