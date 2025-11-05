import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../utils/auditLog';
import { sendWelcomeEmail } from '../utils/emailService';
import crypto from 'crypto';

// ===========================================================
// 🔹 LISTAR UNIDADES PENDENTES
// ===========================================================

export const getPendingUnits = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userRole = user.role || (user as any).user_metadata?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { data: units, error } = await supabase
      .from('units')
      .select(`
        *,
        clinic:clinics!inner(id, name, email, cnpj, phone)
      `)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ units });
  } catch (error: any) {
    console.error('Error fetching pending units:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===========================================================
// 🔹 APROVAR OU REPROVAR UNIDADE
// ===========================================================
export const reviewUnit = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approved, rejection_reason } = req.body;
  const admin_id = req.user!.id;

  try {
    const user = req.user!;
    const userRole = user.role || (user as any).user_metadata?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const newStatus = approved ? 'approved' : 'rejected';

    const { data: unit, error: unitFetchError } = await supabase
      .from('units')
      .select('clinic_id, status')
      .eq('id', id)
      .single();

    if (unitFetchError || !unit) {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }

    if (unit.status !== 'pending_review') {
      return res.status(400).json({ error: 'Unidade não está pendente de aprovação' });
    }

    await supabase
      .from('units')
      .update({
        status: newStatus,
        reviewed_by: admin_id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejection_reason || null,
      })
      .eq('id', id);

    if (approved) {
      await supabase.from('clinics').update({ status: 'active' }).eq('id', unit.clinic_id);

      await supabase
        .from('clinic_users')
        .update({
          status: 'active',
          accepted_at: new Date().toISOString(),
        })
        .eq('clinic_id', unit.clinic_id)
        .eq('status', 'pending_activation');
    } else {
      await supabase
        .from('clinics')
        .update({ status: 'pending_unit' })
        .eq('id', unit.clinic_id);

      await supabase
        .from('clinic_users')
        .update({ unit_id: null })
        .eq('clinic_id', unit.clinic_id)
        .eq('role', 'CADMIN');
    }

    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: admin_id,
      clinic_id: unit.clinic_id,
      unit_id: id,
      action: approved ? 'APPROVE_UNIT' : 'REJECT_UNIT',
      entity_type: 'unit',
      entity_id: id,
      new_values: { status: newStatus, rejection_reason },
      ...metadata,
    });

    res.json({
      success: true,
      status: newStatus,
      message: approved ? 'Unidade aprovada!' : 'Unidade reprovada',
    });
  } catch (error: any) {
    console.error('Error reviewing unit:', error);
    res.status(500).json({ error: 'Erro ao revisar unidade' });
  }
};

// ===========================================================
// 🔹 HELPERS
// ===========================================================

const generateSecurePassword = (): string => {
  const length = 12;
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + special;
  let password = '';
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const mapClinicRoleToInternal = (clinic_role?: string): string => {
  const normalized = (clinic_role || '').toLowerCase();
  if (normalized === 'admin' || normalized === 'cadmin') return 'CADMIN';
  if (normalized === 'manager' || normalized === 'cmanager') return 'CMANAGER';
  return 'CSTAFF';
};

// ===========================================================
// 🔹 CRIAR NOVO USUÁRIO (ADMIN ONLY)
// ===========================================================
export const createUser = async (req: Request, res: Response) => {
  const admin_id = req.user!.id;
  try {
    const user = req.user!;
    const userRole = user.role || (user as any).user_metadata?.role;
    if (userRole !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Acesso negado. Apenas administradores podem criar usuários.' });
    }

    const {
      name,
      email,
      user_type,
      password,
      generate_password = false,
      status,
      cnpj,
      clinic_role,
      crmv,
      phone,
      address,
      city,
      state,
    } = req.body;

    if (!name || !email || !user_type || !status) {
      return res
        .status(400)
        .json({ error: 'Campos obrigatórios: nome, e-mail, tipo de usuário e status' });
    }

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Formato de e-mail inválido' });

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    if (existingUsers?.users?.some((u) => u.email === email)) {
      return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }

    let finalPassword = password;
    let isPasswordGenerated = false;
    if (generate_password || !password) {
      finalPassword = generateSecurePassword();
      isPasswordGenerated = true;
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword!,
      email_confirm: true,
      user_metadata: { name, role: user_type },
    });

    if (authError || !authData?.user) {
      console.error('Auth error:', authError);
      return res
        .status(400)
        .json({ error: authError?.message || 'Erro ao criar usuário no Auth' });
    }

    const newUserId = authData.user.id;
    let profileData: any = null;

    // ===== CLINIC =====
    // ===== CLINIC =====
if (user_type === 'clinic') {
  const internalRole = mapClinicRoleToInternal(clinic_role);

  // Inserir nova clínica (sem passar o ID manualmente)
  const { data: clinicData, error: clinicError } = await supabase
    .from('clinics')
    .insert([
      {
        name,
        email,
        cnpj: cnpj || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        status,
      },
    ])
    .select()
    .single();

  if (clinicError || !clinicData) {
    console.error('Erro ao criar clínica:', clinicError);
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return res.status(400).json({
      error: `Erro ao criar perfil de clínica: ${clinicError?.message || 'Erro desconhecido'}`,
    });
  }

  // Criar vínculo na clinic_users
  const { error: clinicUserError } = await supabase
    .from('clinic_users')
    .insert([
      {
        clinic_id: clinicData.id, // ✅ agora vem do insert, não do Auth
        user_id: newUserId,
        role: internalRole,
        status,
      },
    ]);

  if (clinicUserError)
    console.error('Erro ao criar vínculo clinic_user:', clinicUserError);

  profileData = clinicData;
}

    // ===== VET =====
    else if (user_type === 'vet') {
      const { data: vetData, error: vetError } = await supabase
        .from('vets')
        .insert([
          {
            id: newUserId,
            name,
            email,
            crmv: crmv || null,
            phone: phone || null,
            city: city || null,
            state: state || null,
            specialties: [],
            status,
          },
        ])
        .select()
        .single();

      if (vetError) {
        console.error('Vet creation error:', vetError);
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return res
          .status(400)
          .json({ error: `Erro ao criar perfil de veterinário: ${vetError.message}` });
      }

      profileData = vetData;
    }

    // ===== ADMIN =====
    else if (user_type === 'admin') {
      profileData = {
        id: newUserId,
        name,
        email,
        type: user_type,
        role: 'ADMIN',
      };
    }

    // ===== SUPPLIER / TUTOR =====
    else {
      profileData = { id: newUserId, name, email, type: user_type };
    }

    try {
      await sendWelcomeEmail(email, name, user_type, finalPassword!, isPasswordGenerated);
    } catch (err) {
      console.warn('Erro ao enviar email de boas-vindas:', err);
    }

    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: admin_id,
      action: 'CREATE_USER',
      entity_type: user_type,
      entity_id: newUserId,
      new_values: { name, email, user_type, status },
      ...metadata,
    });

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      user: {
        id: newUserId,
        name,
        email,
        type: user_type,
        status,
        profile: profileData,
      },
      is_password_generated: isPasswordGenerated,
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Erro ao criar usuário' });
  }
};

// ===========================================================
// 🔹 LISTAR TODOS OS ADMINISTRADORES
// ===========================================================
export const getAdmins = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userRole = user.role || (user as any).user_metadata?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    const admins = (usersData?.users || [])
      .filter((u) => u.user_metadata?.role === 'admin')
      .map((u) => ({
        id: u.id,
        name: u.user_metadata?.name || u.email?.split('@')[0] || 'Sem nome',
        email: u.email || '',
        status:
          (u as any).banned_until || (u as any).ban_until ? 'inactive' : 'active',
        created_at: u.created_at || new Date().toISOString(),
        last_sign_in_at: u.last_sign_in_at || null,
      }));

    res.json({ admins });
  } catch (error: any) {
    console.error('Error fetching admins:', error);
    res
      .status(500)
      .json({ error: error.message || 'Erro ao buscar administradores' });
  }
};
