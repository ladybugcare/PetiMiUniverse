import type { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { checkPermission, checkClinicAccess } from '../middleware/authMiddleware';
import { createAuditLog, extractRequestMetadata } from '../utils/auditLog';

interface UnitBody {
  clinic_id: string;
  name: string;
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
    // Verify permission
    const hasPermission = await checkPermission(user_id, clinic_id, 'unit.create');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Sem permissão para criar unidades' });
    }

    // Create unit
    const { data, error } = await supabase
      .from('units')
      .insert([
        {
          clinic_id,
          name,
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

