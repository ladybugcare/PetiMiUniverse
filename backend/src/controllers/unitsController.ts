import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { checkPermission, checkClinicAccess } from '../middleware/authMiddleware';
import { createAuditLog, extractRequestMetadata } from '../utils/auditLog';
import { normalizeCNPJ } from '../utils/cnpjUtils';

interface UnitBody {
  clinic_id: string;
  name: string;
  nickname?: string;
  cnpj?: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
  technical_manager?: string;
  is_main?: boolean;
}

// Create unit (CADMIN only)
export const createUnit = async (req: Request<{}, {}, UnitBody>, res: Response) => {
  const {
    clinic_id,
    name,
    nickname,
    cnpj,
    address,
    city,
    state,
    phone,
    technical_manager,
    is_main,
  } = req.body;
  const user_id = req.user!.id;

  try {
    // Validar nickname obrigatório
    if (!nickname || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'O apelido da unidade é obrigatório' });
    }
    
    // Validar tamanho do nickname (máximo 100 caracteres)
    if (nickname.length > 100) {
      return res.status(400).json({ error: 'O apelido deve ter no máximo 100 caracteres' });
    }
    
    // Verify permission
    const hasPermission = await checkPermission(user_id, clinic_id, 'unit.create');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Sem permissão para criar unidades' });
    }

    // Verificar se nickname é único para esta clínica
    const { data: existingUnit, error: existingError } = await supabase
      .from('units')
      .select('id')
      .eq('clinic_id', clinic_id)
      .eq('nickname', nickname.trim())
      .maybeSingle();
    
    if (existingError) {
      console.error('Error checking nickname uniqueness:', existingError);
    }
    
    if (existingUnit) {
      return res.status(400).json({ 
        error: 'Já existe uma unidade com este apelido nesta clínica' 
      });
    }

    // Create unit
    const { data, error } = await supabase
      .from('units')
      .insert([
        {
          clinic_id,
          name,
          nickname: nickname.trim(),
          cnpj,
          address,
          city,
          state,
          phone,
          technical_manager,
          is_main: is_main || false,
        },
      ])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // Audit log
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id,
      clinic_id,
      unit_id: data[0].id,
      action: 'CREATE_UNIT',
      entity_type: 'unit',
      entity_id: data[0].id,
      new_values: data[0],
      ...metadata,
    });

    res.status(201).json({ unit: data[0] });
  } catch (error: any) {
    console.error('Error creating unit:', error);
    res.status(500).json({ error: 'Erro ao criar unidade' });
  }
};

// Get units by clinic
export const getUnitsByClinic = async (req: Request, res: Response) => {
  const { clinic_id } = req.params;
  const user_id = req.user!.id;

  try {
    // Verify clinic access
    const hasAccess = await checkClinicAccess(user_id, clinic_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('status', 'active')
      .order('is_main', { ascending: false })
      .order('name');

    if (error) return res.status(400).json({ error: error.message });
    res.json({ units: data });
  } catch (error: any) {
    console.error('Error fetching units:', error);
    res.status(500).json({ error: 'Erro ao buscar unidades' });
  }
};

// Get unit by ID
export const getUnitById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user_id = req.user!.id;

  try {
    const { data: unit, error } = await supabase
      .from('units')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return res.status(404).json({ error: 'Unidade não encontrada' });

    // Verify clinic access
    const hasAccess = await checkClinicAccess(user_id, unit.clinic_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json({ unit });
  } catch (error: any) {
    console.error('Error fetching unit:', error);
    res.status(500).json({ error: 'Erro ao buscar unidade' });
  }
};

// Update unit
export const updateUnit = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  const user_id = req.user!.id;

  try {
    // Get current unit
    const { data: currentUnit, error: fetchError } = await supabase
      .from('units')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) return res.status(404).json({ error: 'Unidade não encontrada' });

    // Verify permission
    const hasPermission = await checkPermission(
      user_id,
      currentUnit.clinic_id,
      'unit.edit'
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Sem permissão para editar unidades' });
    }

    // Update unit
    const { data, error } = await supabase
      .from('units')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // Audit log
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id,
      clinic_id: currentUnit.clinic_id,
      unit_id: id,
      action: 'UPDATE_UNIT',
      entity_type: 'unit',
      entity_id: id,
      old_values: currentUnit,
      new_values: data[0],
      ...metadata,
    });

    res.json({ unit: data[0] });
  } catch (error: any) {
    console.error('Error updating unit:', error);
    res.status(500).json({ error: 'Erro ao atualizar unidade' });
  }
};

// Delete unit (soft delete)
export const deleteUnit = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user_id = req.user!.id;

  try {
    // Get current unit
    const { data: currentUnit, error: fetchError } = await supabase
      .from('units')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) return res.status(404).json({ error: 'Unidade não encontrada' });

    // Verify permission
    const hasPermission = await checkPermission(
      user_id,
      currentUnit.clinic_id,
      'unit.delete'
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Sem permissão para deletar unidades' });
    }

    // Don't allow deletion of main unit
    if (currentUnit.is_main) {
      return res.status(400).json({ error: 'Não é possível deletar a unidade principal' });
    }

    // Soft delete
    const { data, error } = await supabase
      .from('units')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // Audit log
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id,
      clinic_id: currentUnit.clinic_id,
      unit_id: id,
      action: 'DELETE_UNIT',
      entity_type: 'unit',
      entity_id: id,
      old_values: currentUnit,
      new_values: data[0],
      ...metadata,
    });

    res.json({ message: 'Unidade deletada com sucesso', unit: data[0] });
  } catch (error: any) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'Erro ao deletar unidade' });
  }
};

// Get unit statistics
export const getUnitStats = async (req: Request<{ unitId: string }>, res: Response) => {
  const { unitId } = req.params;
  const user_id = req.user!.id;

  try {
    // Get unit to verify access
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single();

    if (unitError) return res.status(404).json({ error: 'Unidade não encontrada' });

    // Verify clinic access
    const hasAccess = await checkClinicAccess(user_id, unit.clinic_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Get demands count for this unit
    const { count: totalDemands, error: demandsError } = await supabase
      .from('demands')
      .select('*', { count: 'exact', head: true })
      .eq('unit_id', unitId);

    if (demandsError) throw demandsError;

    // Get open demands count
    const { count: openDemands, error: openError } = await supabase
      .from('demands')
      .select('*', { count: 'exact', head: true })
      .eq('unit_id', unitId)
      .eq('status', 'open');

    if (openError) throw openError;

    // Get demand IDs for this unit
    const { data: unitDemands, error: unitDemandsError } = await supabase
      .from('demands')
      .select('id')
      .eq('unit_id', unitId);

    if (unitDemandsError) throw unitDemandsError;

    const demandIds = unitDemands?.map(d => d.id) || [];

    let applicationsCount = 0;
    let pendingApplicationsCount = 0;

    if (demandIds.length > 0) {
      // Get applications for unit's demands
      const { count: totalApps, error: appsError } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .in('demand_id', demandIds);

      if (appsError) throw appsError;
      applicationsCount = totalApps || 0;

      // Get pending applications
      const { count: pendingApps, error: pendingError } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .in('demand_id', demandIds)
        .eq('status', 'applied');

      if (pendingError) throw pendingError;
      pendingApplicationsCount = pendingApps || 0;
    }

    res.json({
      stats: {
        totalDemands: totalDemands || 0,
        openDemands: openDemands || 0,
        totalApplications: applicationsCount,
        pendingApplications: pendingApplicationsCount,
      },
    });
  } catch (error: any) {
    console.error('Error getting unit stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas da unidade' });
  }
};

// Create first unit (for new clinics waiting approval)
// ✅ NOVO FLUXO: Cria clinic primeiro (se não existir), depois cria unit e atualiza clinic_user
export const createFirstUnit = async (req: Request<{}, {}, UnitBody & { clinic_name?: string; clinic_cnpj?: string; clinic_address?: string }>, res: Response) => {
  const { clinic_id, name, nickname, address, city, state, phone, cnpj, technical_manager, clinic_name, clinic_cnpj, clinic_address } = req.body;
  const user_id = req.user!.id;
  
  try {
    // Validar nickname obrigatório
    if (!nickname || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'O apelido da unidade é obrigatório' });
    }
    
    // Validar tamanho do nickname (máximo 100 caracteres)
    if (nickname.length > 100) {
      return res.status(400).json({ error: 'O apelido deve ter no máximo 100 caracteres' });
    }
    
    // ✅ 1. Verificar clinic_user (deve existir com clinic_id = NULL e status = 'pending_clinic')
    const { data: clinicUser, error: clinicUserError } = await supabase
      .from('clinic_users')
      .select('id, role, clinic_id, status')
      .eq('user_id', user_id)
      .eq('role', 'CADMIN')
      .maybeSingle();
      
    if (clinicUserError || !clinicUser) {
      return res.status(403).json({ error: 'Usuário não encontrado ou sem permissão para criar primeira unidade' });
    }

    // Se clinic_id já existe, significa que já tem clínica (não deveria estar aqui)
    if (clinicUser.clinic_id) {
      return res.status(400).json({ 
        error: 'Usuário já possui clínica. Use o endpoint de criação de unidade normal.' 
      });
    }

    // ✅ 2. Buscar dados do usuário do Auth (name, cnpj, address do signup)
    let clinicName = clinic_name;
    let clinicCnpj = clinic_cnpj ? normalizeCNPJ(clinic_cnpj) : null;
    let clinicAddress = clinic_address;

    if (!clinicName || !clinicAddress) {
      // Buscar do user_metadata do Auth
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(user_id);
      if (!authError && authUser?.user) {
        const metadata = authUser.user.user_metadata || {};
        clinicName = clinicName || metadata.name || 'Clínica sem nome';
        clinicCnpj = clinicCnpj || (metadata.cnpj ? normalizeCNPJ(metadata.cnpj) : null);
        clinicAddress = clinicAddress || metadata.address || '';
      }
    }

    if (!clinicName) {
      return res.status(400).json({ error: 'Nome da clínica é obrigatório' });
    }

    // ✅ 3. Criar clinic (se não existir)
    let finalClinicId: string;
    const { data: existingClinic } = await supabase
      .from('clinics')
      .select('id, status')
      .eq('id', user_id) // Clinic ID = User ID
      .maybeSingle();

    if (existingClinic) {
      // Clinic já existe, atualizar dados
      finalClinicId = existingClinic.id;
      await supabase
        .from('clinics')
        .update({
          name: clinicName,
          cnpj: clinicCnpj,
          address: clinicAddress,
          status: 'pending_unit', // Mudará para pending_approval após criar unit
          updated_at: new Date().toISOString(),
        })
        .eq('id', finalClinicId);
    } else {
      // Criar nova clinic
      const { data: newClinic, error: createClinicError } = await supabase
        .from('clinics')
        .insert({
          id: user_id, // Clinic ID = User ID
          name: clinicName,
          cnpj: clinicCnpj,
          address: clinicAddress,
          email: req.user!.email || null,
          status: 'pending_unit', // Mudará para pending_approval após criar unit
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createClinicError) {
        console.error('Error creating clinic:', createClinicError);
        return res.status(500).json({ error: 'Erro ao criar clínica' });
      }

      finalClinicId = newClinic.id;
    }
    
    // ✅ 4. Verificar se nickname é único para esta clínica
    const { data: existingUnit, error: existingError } = await supabase
      .from('units')
      .select('id')
      .eq('clinic_id', finalClinicId)
      .eq('nickname', nickname.trim())
      .maybeSingle();
    
    if (existingError) {
      console.error('Error checking nickname uniqueness:', existingError);
    }
    
    if (existingUnit) {
      return res.status(400).json({ 
        error: 'Já existe uma unidade com este apelido nesta clínica' 
      });
    }
    
    // ✅ 5. Criar unidade com status pending_review
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .insert({
        clinic_id: finalClinicId,
        name,
        nickname: nickname.trim(),
        address,
        city,
        state,
        phone,
        cnpj: cnpj ? normalizeCNPJ(cnpj) : null,
        technical_manager,
        is_main: true,
        status: 'pending_review'
      })
      .select()
      .single();
      
    if (unitError) {
      console.error('Error creating unit:', unitError);
      return res.status(500).json({ error: 'Erro ao criar unidade' });
    }
    
    // ✅ 6. Atualizar clinic para pending_approval
    await supabase
      .from('clinics')
      .update({ status: 'pending_approval' })
      .eq('id', finalClinicId);
    
    // ✅ 7. Atualizar clinic_user com clinic_id e unit_id
    const nowIso = new Date().toISOString();
    const { error: updateClinicUserError } = await supabase
      .from('clinic_users')
      .update({ 
        clinic_id: finalClinicId, // ✅ Agora vincula à clinic criada
        unit_id: unit.id,          // ✅ Vincula à primeira unidade
        status: 'active',          // ✅ Ativa o usuário
        first_login_completed_at: nowIso,
        onboarding_state: {
          last_step: 'unit',
          completed: true,
          completed_at: nowIso,
        },
        updated_at: nowIso,
      })
      .eq('id', clinicUser.id);
    
    if (updateClinicUserError) {
      console.error('Error updating clinic_user:', updateClinicUserError);
      // Rollback: deletar unit e clinic criados
      await supabase.from('units').delete().eq('id', unit.id);
      if (!existingClinic) {
        await supabase.from('clinics').delete().eq('id', finalClinicId);
      }
      return res.status(500).json({ error: 'Erro ao vincular usuário à clínica' });
    }
    
    // ✅ 8. Audit log
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id,
      clinic_id: finalClinicId,
      unit_id: unit.id,
      action: 'CREATE_FIRST_UNIT',
      entity_type: 'unit',
      entity_id: unit.id,
      new_values: unit,
      ...metadata,
    });
    
    res.status(201).json({ 
      clinic_id: finalClinicId,
      unit,
      message: 'Clínica e unidade criadas! Aguarde aprovação do ADMIN para ativar sua conta.' 
    });
  } catch (error: any) {
    console.error('Error creating first unit:', error);
    res.status(500).json({ error: 'Erro ao criar unidade' });
  }
};

