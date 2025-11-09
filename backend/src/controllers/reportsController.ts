import type { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { checkClinicAccess } from '../middleware/authMiddleware';

// Helper function to calculate date range based on period
const getDateRange = (period: string, startDate?: string, endDate?: string) => {
  const now = new Date();
  let start: Date;
  let end: Date = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'custom' && startDate && endDate) {
    start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  } else if (period === '7d') {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (period === '30d') {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  } else if (period === '90d') {
    start = new Date(now);
    start.setDate(start.getDate() - 90);
    start.setHours(0, 0, 0, 0);
  } else {
    // Default to 30 days
    start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
};

// Helper to parse unit_ids from query string
const parseUnitIds = (unitIds?: string | string[]): string[] | null => {
  if (!unitIds) return null;
  if (Array.isArray(unitIds)) return unitIds;
  if (typeof unitIds === 'string') {
    // Support both comma-separated and array format
    return unitIds.split(',').filter(id => id.trim().length > 0);
  }
  return null;
};

// Get clinic reports overview
export const getClinicReportsOverview = async (
  req: Request<{ clinicId: string }>,
  res: Response
) => {
  const { clinicId } = req.params;
  const { period = '30d', startDate, endDate, unit_ids } = req.query;

  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId is required' });
  }

  // Check if user has access to this clinic
  const user_id = req.user?.id;
  if (!user_id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  const hasAccess = await checkClinicAccess(user_id, clinicId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado a esta clínica' });
  }

  try {
    const { start, end } = getDateRange(period as string, startDate as string, endDate as string);
    const unitIds = parseUnitIds(unit_ids as string | string[]);

    // Build base query for demands
    let demandsQuery = supabase
      .from('demands')
      .select('id, status, created_at, unit_id')
      .eq('clinic_id', clinicId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (unitIds && unitIds.length > 0) {
      demandsQuery = demandsQuery.in('unit_id', unitIds);
    }

    const { data: demands, error: demandsError } = await demandsQuery;
    if (demandsError) throw demandsError;

    // Get all positions for these demands
    const demandIds = demands?.map(d => d.id) || [];
    let positionsQuery = supabase
      .from('demand_positions')
      .select('id, master_demand_id, specialty, total_slots, filled_slots, status, created_at')
      .in('master_demand_id', demandIds);

    const { data: positions, error: positionsError } = await positionsQuery;
    if (positionsError) throw positionsError;

    // Get accepted applications to calculate professionals hired
    const positionIds = positions?.map(p => p.id) || [];
    let applicationsQuery = supabase
      .from('position_applications')
      .select('id, position_id, vet_id, accepted_at')
      .eq('status', 'accepted')
      .in('position_id', positionIds);

    if (positionIds.length > 0) {
      applicationsQuery = applicationsQuery.gte('accepted_at', start.toISOString())
        .lte('accepted_at', end.toISOString());
    }

    const { data: applications, error: appsError } = await applicationsQuery;
    if (appsError) throw appsError;

    // Calculate metrics
    const totalDemandsCreated = demands?.length || 0;
    const demandsByStatus = {
      open: demands?.filter(d => d.status === 'open').length || 0,
      in_progress: demands?.filter(d => d.status === 'in_progress').length || 0,
      closed: demands?.filter(d => d.status === 'closed').length || 0,
      cancelled: demands?.filter(d => d.status === 'cancelled').length || 0,
    };

    const totalPositionsCreated = positions?.length || 0;
    const totalPositionsFilled = positions?.filter(p => p.status === 'filled').length || 0;

    // Unique professionals hired (unique vet_ids with accepted applications)
    const uniqueVetIds = new Set(applications?.map(a => a.vet_id) || []);
    const professionalsHired = uniqueVetIds.size;

    // Calculate average fill time (days between position creation and first acceptance)
    const fillTimes: number[] = [];
    if (positions && applications) {
      positions.forEach(position => {
        if (position.status === 'filled' && position.filled_slots > 0) {
          const positionApps = applications.filter(a => a.position_id === position.id);
          if (positionApps.length > 0) {
            const firstAccepted = positionApps
              .map(a => a.accepted_at ? new Date(a.accepted_at).getTime() : null)
              .filter(t => t !== null)
              .sort((a, b) => (a || 0) - (b || 0))[0];

            if (firstAccepted) {
              const positionCreated = new Date(position.created_at).getTime();
              const daysDiff = (firstAccepted - positionCreated) / (1000 * 60 * 60 * 24);
              if (daysDiff >= 0) {
                fillTimes.push(daysDiff);
              }
            }
          }
        }
      });
    }

    const averageFillTime = fillTimes.length > 0
      ? fillTimes.reduce((sum, time) => sum + time, 0) / fillTimes.length
      : 0;

    res.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      summary: {
        totalDemandsCreated,
        demandsByStatus,
        totalPositionsCreated,
        totalPositionsFilled,
        professionalsHired,
        averageFillTime: Math.round(averageFillTime * 100) / 100, // Round to 2 decimals
      },
    });
  } catch (error: any) {
    console.error('Error getting clinic reports overview:', error);
    res.status(500).json({ error: error.message || 'Failed to get clinic reports overview' });
  }
};

// Get clinic reports - demands details
export const getClinicReportsDemands = async (
  req: Request<{ clinicId: string }>,
  res: Response
) => {
  const { clinicId } = req.params;
  const { period = '30d', startDate, endDate, unit_ids } = req.query;

  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId is required' });
  }

  // Check if user has access to this clinic
  const user_id = req.user?.id;
  if (!user_id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  const hasAccess = await checkClinicAccess(user_id, clinicId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado a esta clínica' });
  }

  try {
    const { start, end } = getDateRange(period as string, startDate as string, endDate as string);
    const unitIds = parseUnitIds(unit_ids as string | string[]);

    // Get demands with details
    let demandsQuery = supabase
      .from('demands')
      .select('id, title, status, created_at, demand_date, unit_id, clinic_id')
      .eq('clinic_id', clinicId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    if (unitIds && unitIds.length > 0) {
      demandsQuery = demandsQuery.in('unit_id', unitIds);
    }

    const { data: demands, error: demandsError } = await demandsQuery;
    if (demandsError) throw demandsError;

    // Get positions for all demands
    const demandIds = demands?.map(d => d.id) || [];
    let positionsQuery = supabase
      .from('demand_positions')
      .select('id, master_demand_id, specialty, total_slots, filled_slots, status, created_at')
      .in('master_demand_id', demandIds);

    const { data: positions, error: positionsError } = await positionsQuery;
    if (positionsError) throw positionsError;

    // Get accepted applications to calculate fill time
    const positionIds = positions?.map(p => p.id) || [];
    let applicationsQuery = supabase
      .from('position_applications')
      .select('id, position_id, accepted_at')
      .eq('status', 'accepted')
      .in('position_id', positionIds);

    const { data: applications, error: appsError } = await applicationsQuery;
    if (appsError) throw appsError;

    // Get unit names
    const allUnitIds = [...new Set(demands?.map(d => d.unit_id).filter(Boolean) || [])];
    const { data: units } = await supabase
      .from('units')
      .select('id, name')
      .in('id', allUnitIds);

    const unitNamesMap: { [key: string]: string } = {};
    units?.forEach(unit => {
      unitNamesMap[unit.id] = unit.name;
    });

    // Build demands with positions
    const demandsWithPositions = demands?.map(demand => {
      const demandPositions = positions?.filter(p => p.master_demand_id === demand.id) || [];
      
      // Calculate fill time for this demand (average of all filled positions)
      const fillTimes: number[] = [];
      demandPositions.forEach(position => {
        if (position.status === 'filled') {
          const positionApps = applications?.filter(a => a.position_id === position.id) || [];
          if (positionApps.length > 0) {
            const firstAccepted = positionApps
              .map(a => a.accepted_at ? new Date(a.accepted_at).getTime() : null)
              .filter(t => t !== null)
              .sort((a, b) => (a || 0) - (b || 0))[0];

            if (firstAccepted) {
              const positionCreated = new Date(position.created_at).getTime();
              const daysDiff = (firstAccepted - positionCreated) / (1000 * 60 * 60 * 24);
              if (daysDiff >= 0) {
                fillTimes.push(daysDiff);
              }
            }
          }
        }
      });

      const fillTime = fillTimes.length > 0
        ? fillTimes.reduce((sum, time) => sum + time, 0) / fillTimes.length
        : undefined;

      return {
        id: demand.id,
        title: demand.title,
        status: demand.status,
        created_at: demand.created_at,
        demand_date: demand.demand_date,
        unit_id: demand.unit_id,
        unit_name: demand.unit_id ? unitNamesMap[demand.unit_id] : null,
        positions: demandPositions.map(p => ({
          id: p.id,
          specialty: p.specialty,
          total_slots: p.total_slots,
          filled_slots: p.filled_slots,
          status: p.status,
        })),
        fillTime: fillTime ? Math.round(fillTime * 100) / 100 : undefined,
      };
    }) || [];

    // Calculate by status
    const byStatus = {
      open: demands?.filter(d => d.status === 'open').length || 0,
      in_progress: demands?.filter(d => d.status === 'in_progress').length || 0,
      closed: demands?.filter(d => d.status === 'closed').length || 0,
      cancelled: demands?.filter(d => d.status === 'cancelled').length || 0,
    };

    // Calculate by specialty
    const bySpecialty: { [key: string]: { created: number; filled: number; successRate: number } } = {};
    positions?.forEach(position => {
      if (!bySpecialty[position.specialty]) {
        bySpecialty[position.specialty] = { created: 0, filled: 0, successRate: 0 };
      }
      bySpecialty[position.specialty].created++;
      if (position.status === 'filled') {
        bySpecialty[position.specialty].filled++;
      }
    });

    // Calculate success rates
    Object.keys(bySpecialty).forEach(specialty => {
      const data = bySpecialty[specialty];
      data.successRate = data.created > 0
        ? Math.round((data.filled / data.created) * 100 * 100) / 100
        : 0;
    });

    res.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      demands: demandsWithPositions,
      byStatus,
      bySpecialty,
    });
  } catch (error: any) {
    console.error('Error getting clinic reports demands:', error);
    res.status(500).json({ error: error.message || 'Failed to get clinic reports demands' });
  }
};

// Get clinic reports - professionals hired
export const getClinicReportsProfessionals = async (
  req: Request<{ clinicId: string }>,
  res: Response
) => {
  const { clinicId } = req.params;
  const { period = '30d', startDate, endDate, unit_ids } = req.query;

  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId is required' });
  }

  // Check if user has access to this clinic
  const user_id = req.user?.id;
  if (!user_id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  const hasAccess = await checkClinicAccess(user_id, clinicId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado a esta clínica' });
  }

  try {
    const { start, end } = getDateRange(period as string, startDate as string, endDate as string);
    const unitIds = parseUnitIds(unit_ids as string | string[]);

    // Get demands in period
    let demandsQuery = supabase
      .from('demands')
      .select('id, title, unit_id')
      .eq('clinic_id', clinicId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (unitIds && unitIds.length > 0) {
      demandsQuery = demandsQuery.in('unit_id', unitIds);
    }

    const { data: demands, error: demandsError } = await demandsQuery;
    if (demandsError) throw demandsError;

    // Get positions for these demands
    const demandIds = demands?.map(d => d.id) || [];
    let positionsQuery = supabase
      .from('demand_positions')
      .select('id, master_demand_id, specialty')
      .in('master_demand_id', demandIds);

    const { data: positions, error: positionsError } = await positionsQuery;
    if (positionsError) throw positionsError;

    // Get accepted applications in period
    const positionIds = positions?.map(p => p.id) || [];
    let applicationsQuery = supabase
      .from('position_applications')
      .select('id, position_id, vet_id, accepted_at')
      .eq('status', 'accepted')
      .in('position_id', positionIds)
      .gte('accepted_at', start.toISOString())
      .lte('accepted_at', end.toISOString())
      .order('accepted_at', { ascending: false });

    const { data: applications, error: appsError } = await applicationsQuery;
    if (appsError) throw appsError;

    // Get vet details
    const vetIds = [...new Set(applications?.map(a => a.vet_id) || [])];
    const { data: vets } = await supabase
      .from('vets')
      .select('id, name, crmv, specialties')
      .in('id', vetIds);

    const vetsMap: { [key: string]: any } = {};
    vets?.forEach(vet => {
      vetsMap[vet.id] = vet;
    });

    // Get unit names
    const allUnitIds = [...new Set(demands?.map(d => d.unit_id).filter(Boolean) || [])];
    const { data: units } = await supabase
      .from('units')
      .select('id, name')
      .in('id', allUnitIds);

    const unitNamesMap: { [key: string]: string } = {};
    units?.forEach(unit => {
      unitNamesMap[unit.id] = unit.name;
    });

    // Build positions map
    const positionsMap: { [key: string]: any } = {};
    positions?.forEach(position => {
      positionsMap[position.id] = position;
    });

    // Build demands map
    const demandsMap: { [key: string]: any } = {};
    demands?.forEach(demand => {
      demandsMap[demand.id] = demand;
    });

    // Build hired professionals list
    const hired = applications?.map(app => {
      const position = positionsMap[app.position_id];
      const demand = position ? demandsMap[position.master_demand_id] : null;
      const vet = vetsMap[app.vet_id];

      return {
        vet_id: app.vet_id,
        vet_name: vet?.name || 'N/A',
        vet_crmv: vet?.crmv || null,
        specialty: position?.specialty || 'N/A',
        position_id: app.position_id,
        accepted_at: app.accepted_at,
        demand_id: demand?.id || null,
        demand_title: demand?.title || 'N/A',
        unit_id: demand?.unit_id || null,
        unit_name: demand?.unit_id ? unitNamesMap[demand.unit_id] : null,
      };
    }) || [];

    // Calculate by specialty
    const bySpecialty: { [key: string]: number } = {};
    hired.forEach(h => {
      if (!bySpecialty[h.specialty]) {
        bySpecialty[h.specialty] = 0;
      }
      bySpecialty[h.specialty]++;
    });

    // Calculate average hire time (time from position creation to acceptance)
    const hireTimes: number[] = [];
    applications?.forEach(app => {
      const position = positionsMap[app.position_id];
      if (position && app.accepted_at) {
        // Get position creation time from demand
        const demand = position.master_demand_id ? demandsMap[position.master_demand_id] : null;
        if (demand) {
          // Use demand created_at as proxy for position creation
          const positionCreated = new Date(demand.created_at || app.accepted_at).getTime();
          const accepted = new Date(app.accepted_at).getTime();
          const daysDiff = (accepted - positionCreated) / (1000 * 60 * 60 * 24);
          if (daysDiff >= 0) {
            hireTimes.push(daysDiff);
          }
        }
      }
    });

    const averageHireTime = hireTimes.length > 0
      ? hireTimes.reduce((sum, time) => sum + time, 0) / hireTimes.length
      : 0;

    res.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      hired,
      bySpecialty,
      averageHireTime: Math.round(averageHireTime * 100) / 100,
    });
  } catch (error: any) {
    console.error('Error getting clinic reports professionals:', error);
    res.status(500).json({ error: error.message || 'Failed to get clinic reports professionals' });
  }
};

