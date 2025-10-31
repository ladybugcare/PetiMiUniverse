import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../utils/auditLog';
import { sendWelcomeEmail } from '../utils/emailService';
import crypto from 'crypto';

// Listar unidades pendentes de aprovação
export const getPendingUnits = async (req: Request, res: Response) => {
  try {
    // Verificar se é ADMIN
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

// Aprovar ou reprovar unidade
export const reviewUnit = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approved, rejection_reason } = req.body;
  const admin_id = req.user!.id;
  
  try {
    // Verificar se é ADMIN
    const user = req.user!;
    const userRole = user.role || (user as any).user_metadata?.role;
    
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    const newStatus = approved ? 'approved' : 'rejected';
    
    // Buscar unidade e clínica
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
    
    // Atualizar unidade
    await supabase
      .from('units')
      .update({ 
        status: newStatus,
        reviewed_by: admin_id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejection_reason || null
      })
      .eq('id', id);
    
    if (approved) {
      // Ativar clínica
      await supabase
        .from('clinics')
        .update({ status: 'active' })
        .eq('id', unit.clinic_id);
      
      // Ativar todos clinic_users desta clínica
      await supabase
        .from('clinic_users')
        .update({ 
          status: 'active',
          accepted_at: new Date().toISOString() 
        })
        .eq('clinic_id', unit.clinic_id)
        .eq('status', 'pending_activation');
        
      // TODO: Enviar email de aprovação
    } else {
      // Voltar status da clínica para pending_unit
      await supabase
        .from('clinics')
        .update({ status: 'pending_unit' })
        .eq('id', unit.clinic_id);
        
      // Remover vínculo de unit_id do CADMIN
      await supabase
        .from('clinic_users')
        .update({ unit_id: null })
        .eq('clinic_id', unit.clinic_id)
        .eq('role', 'CADMIN');
        
      // TODO: Enviar email de rejeição
    }
    
    // Audit log
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
      message: approved ? 'Unidade aprovada!' : 'Unidade reprovada'
    });
  } catch (error: any) {
    console.error('Error reviewing unit:', error);
    res.status(500).json({ error: 'Erro ao revisar unidade' });
  }
};

// Generate secure random password
const generateSecurePassword = (): string => {
  const length = 12;
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + special;
  
  let password = '';
  // Ensure at least one of each type
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Validar formato de email
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Verificar se email já existe
const checkEmailExists = async (email: string): Promise<boolean> => {
  // Verificar em auth.users usando admin API
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (!authError && authUsers?.users) {
    const existsInAuth = authUsers.users.some(user => user.email === email);
    if (existsInAuth) return true;
  }
  
  // Verificar em clinics
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  
  if (!clinicError && clinic) return true;
  
  // Verificar em vets
  const { data: vet, error: vetError } = await supabase
    .from('vets')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  
  if (!vetError && vet) return true;
  
  return false;
};

interface CreateUserBody {
  name: string;
  email: string;
  user_type: 'clinic' | 'vet' | 'supplier' | 'tutor' | 'admin';
  password?: string;
  generate_password?: boolean;
  status: 'active' | 'inactive';
  // Campos específicos por tipo
  cnpj?: string; // para clinic
  clinic_role?: 'standard' | 'premium' | 'partner'; // role da clínica
  crmv?: string; // para vet
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
}

// Criar novo usuário (admin only)
export const createUser = async (req: Request<{}, {}, CreateUserBody>, res: Response) => {
  const admin_id = req.user!.id;
  
  try {
    // Verificar se é ADMIN
    const user = req.user!;
    const userRole = user.role || (user as any).user_metadata?.role;
    
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem criar usuários.' });
    }
    
    const { 
      name, 
      email, 
      user_type, 
      password, 
      generate_password = false,
      status,
      cnpj,
      clinic_role = 'standard',
      crmv,
      phone,
      address,
      city,
      state
    } = req.body;
    
    // Validações
    if (!name || !email || !user_type || !status) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, email, tipo de usuário e status' });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Formato de e-mail inválido' });
    }
    
    // Verificar email único
    const emailExists = await checkEmailExists(email);
    if (emailExists) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado' });
    }
    
    // Gerar senha se necessário
    let finalPassword = password;
    let isPasswordGenerated = false;
    
    if (generate_password || !password) {
      finalPassword = generateSecurePassword();
      isPasswordGenerated = true;
    }
    
    if (!finalPassword || finalPassword.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
    }
    
    // Criar usuário no Supabase Auth usando admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true, // Confirmar email automaticamente
      user_metadata: {
        name,
        role: user_type,
      },
    });
    
    if (authError || !authData.user) {
      console.error('Auth error:', authError);
      return res.status(400).json({ error: authError?.message || 'Erro ao criar usuário no sistema de autenticação' });
    }
    
    console.log('Auth user created:', authData.user.id);
    
    // Criar perfil específico baseado no tipo
    let profileData: any = null;
    
    if (user_type === 'clinic') {
      const { data: clinicData, error: clinicError } = await supabase
        .from('clinics')
        .insert([{
          id: authData.user.id,
          name,
          email,
          cnpj: cnpj || null,
          role: clinic_role || 'standard',
          phone: phone || null,
          address: address || null,
          city: city || null,
          state: state || null,
          status: status,
        }])
        .select()
        .single();
      
      if (clinicError) {
        console.error('Clinic profile creation error:', clinicError);
        // Tentar remover o usuário do auth se possível
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(400).json({ error: `Erro ao criar perfil de clínica: ${clinicError.message}` });
      }
      
      profileData = clinicData;
      
    } else if (user_type === 'vet') {
      const { data: vetData, error: vetError } = await supabase
        .from('vets')
        .insert([{
          id: authData.user.id,
          name,
          email,
          crmv: crmv || null,
          phone: phone || null,
          city: city || null,
          state: state || null,
          specialties: [],
          status: status, // Campo status adicionado via migration
        }])
        .select()
        .single();
      
      if (vetError) {
        console.error('Vet profile creation error:', vetError);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(400).json({ error: `Erro ao criar perfil de veterinário: ${vetError.message}` });
      }
      
      profileData = vetData;
      
    } else if (user_type === 'admin') {
      // Para admin, apenas criamos no auth.users com role 'admin'
      // Não precisa de tabela específica
      profileData = {
        id: authData.user.id,
        name,
        email,
        type: user_type,
        role: 'admin',
      };
      
    } else if (user_type === 'supplier' || user_type === 'tutor') {
      // Para tipos futuros, por enquanto só criamos no auth.users
      // Pode criar tabela específica depois
      profileData = {
        id: authData.user.id,
        name,
        email,
        type: user_type,
      };
    }
    
    // Enviar email de boas-vindas
    try {
      await sendWelcomeEmail(
        email,
        name,
        user_type,
        finalPassword,
        isPasswordGenerated
      );
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
      // Não falhar a criação se o email falhar
    }
    
    // Audit log
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: admin_id,
      action: 'CREATE_USER',
      entity_type: user_type,
      entity_id: authData.user.id,
      new_values: {
        name,
        email,
        user_type,
        status,
        created_by_admin: admin_id,
      },
      ...metadata,
    });
    
    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      user: {
        id: authData.user.id,
        name,
        email,
        type: user_type,
        status,
        profile: profileData,
      },
      password_sent: true,
      is_password_generated: isPasswordGenerated,
    });
    
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Erro ao criar usuário' });
  }
};

// Listar todos os administradores (admin only)
export const getAdmins = async (req: Request, res: Response) => {
  try {
    // Verificar se é ADMIN
    const user = req.user!;
    const userRole = user.role || (user as any).user_metadata?.role;
    
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    // Buscar todos os usuários com role 'admin' no auth.users
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      throw usersError;
    }
    
    // Filtrar apenas admins e formatar dados
    const admins = (usersData?.users || [])
      .filter(user => {
        const role = user.user_metadata?.role;
        return role === 'admin';
      })
      .map(user => ({
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Sem nome',
        email: user.email || '',
        status: ((user as any).banned_until || (user as any).ban_until) ? 'inactive' : 'active',
        created_at: user.created_at || new Date().toISOString(),
        last_sign_in_at: user.last_sign_in_at || null,
      }));
    
    res.json({ admins });
  } catch (error: any) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar administradores' });
  }
};

