import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';

// Get clinic statistics (for CADMIN role)
export const getClinicStats = async (req: Request<{ clinicId: string }>, res: Response) => {
  const { clinicId } = req.params;
  const { unit_id } = req.query;

  console.log('getClinicStats called with:', { clinicId, unit_id });

  if (!clinicId) {
    return res.status(400).json({ error: 'clinicId is required' });
  }

  try {
    // Get demands count by status
    let demandsQuery = supabase
      .from('demands')
      .select('status', { count: 'exact' })
      .eq('clinic_id', clinicId);

    if (unit_id) {
      demandsQuery = demandsQuery.eq('unit_id', unit_id);
    }

    const { count: totalDemands, error: demandsError } = await demandsQuery;
    if (demandsError) throw demandsError;

    // Get open demands count
    let openDemandsQuery = supabase
      .from('demands')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'open');

    if (unit_id) {
      openDemandsQuery = openDemandsQuery.eq('unit_id', unit_id);
    }

    const { count: openDemands, error: openError } = await openDemandsQuery;
    if (openError) throw openError;

    // Get applications count (for clinic's demand_positions)
    // First get all positions for this clinic's demands
    const { data: clinicDemandPositions, error: positionsError} = await supabase
      .from('demand_positions')
      .select('id, master_demand_id, demands!inner(clinic_id)')
      .eq('demands.clinic_id', clinicId);

    if (positionsError) throw positionsError;

    const positionIds = clinicDemandPositions?.map(p => p.id) || [];

    let applicationsCount = 0;
    let pendingApplicationsCount = 0;

    if (positionIds.length > 0) {
      const { count: totalApps, error: appsError } = await supabase
        .from('position_applications')
        .select('*', { count: 'exact', head: true })
        .in('position_id', positionIds);

      if (appsError) throw appsError;
      applicationsCount = totalApps || 0;

      const { count: pendingApps, error: pendingError } = await supabase
        .from('position_applications')
        .select('*', { count: 'exact', head: true })
        .in('position_id', positionIds)
        .eq('status', 'pending');

      if (pendingError) throw pendingError;
      pendingApplicationsCount = pendingApps || 0;
    }

    // Get users count for this clinic
    const { count: totalUsers, error: usersError } = await supabase
      .from('clinic_users')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId);

    if (usersError) throw usersError;

    // Anúncios ativos no marketplace (vendedor = clínica; seller_id costuma coincidir com clinic_id do dono)
    let activeMarketplaceListings = 0;
    const { count: marketplaceActiveCount, error: marketplaceCountError } = await supabase
      .from('marketplace_items')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', clinicId)
      .eq('seller_type', 'clinic')
      .eq('status', 'active');

    if (!marketplaceCountError) {
      activeMarketplaceListings = marketplaceActiveCount || 0;
    }

    res.json({
      stats: {
        totalDemands: totalDemands || 0,
        openDemands: openDemands || 0,
        totalApplications: applicationsCount,
        pendingApplications: pendingApplicationsCount,
        totalUsers: totalUsers || 0,
        activeMarketplaceListings,
      },
    });
  } catch (error: any) {
    console.error('Error getting clinic stats:', error);
    res.status(500).json({ error: error.message || 'Failed to get clinic statistics' });
  }
};

// Get vet statistics
export const getVetStats = async (req: Request<{ vetId: string }>, res: Response) => {
  const { vetId } = req.params;

  try {
    // Get vet's applications count by status
    const { count: totalApplications, error: appsError } = await supabase
      .from('position_applications')
      .select('*', { count: 'exact', head: true })
      .eq('vet_id', vetId);

    if (appsError) throw appsError;

    // Get accepted applications (active jobs)
    const { count: activeJobs, error: activeError } = await supabase
      .from('position_applications')
      .select('*', { count: 'exact', head: true })
      .eq('vet_id', vetId)
      .eq('status', 'accepted');

    if (activeError) throw activeError;

    // Get pending applications
    const { count: pendingApplications, error: pendingError } = await supabase
      .from('position_applications')
      .select('*', { count: 'exact', head: true })
      .eq('vet_id', vetId)
      .eq('status', 'pending');

    if (pendingError) throw pendingError;

    // Get available opportunities (open demand positions for vets)
    const { count: availableOpportunities, error: opportunitiesError } = await supabase
      .from('demand_positions')
      .select('*, demands!inner(*)', { count: 'exact', head: true })
      .eq('demands.category', 'vet')
      .eq('demands.status', 'open')
      .eq('status', 'open');

    if (opportunitiesError) throw opportunitiesError;

    // Calculate completed jobs (positions with accepted application from closed demands)
    const { data: acceptedApps, error: acceptedError } = await supabase
      .from('position_applications')
      .select('position_id, demand_positions!inner(master_demand_id)')
      .eq('vet_id', vetId)
      .eq('status', 'accepted');

    if (acceptedError) throw acceptedError;

    const acceptedDemandIds = acceptedApps?.map((a: any) => a.demand_positions.master_demand_id) || [];
    let completedJobs = 0;

    if (acceptedDemandIds.length > 0) {
      const { count, error: completedError } = await supabase
        .from('demands')
        .select('*', { count: 'exact', head: true })
        .in('id', acceptedDemandIds)
        .eq('status', 'closed');

      if (completedError) throw completedError;
      completedJobs = count || 0;
    }

    res.json({
      stats: {
        totalApplications: totalApplications || 0,
        activeJobs: activeJobs || 0,
        pendingApplications: pendingApplications || 0,
        availableOpportunities: availableOpportunities || 0,
        completedJobs,
        averageRating: 4.8, // TODO: Implement reviews system
      },
    });
  } catch (error: any) {
    console.error('Error getting vet stats:', error);
    res.status(500).json({ error: error.message || 'Failed to get vet statistics' });
  }
};

// Get system-wide statistics (admin only)
export const getSystemStats = async (req: Request, res: Response) => {
  try {
    // Verificar se é admin
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
    }

    // Get total clinics
    const { count: totalClinics, error: clinicsError } = await supabase
      .from('clinics')
      .select('*', { count: 'exact', head: true });

    if (clinicsError) {
      console.error('Erro ao buscar clínicas:', clinicsError);
      throw clinicsError;
    }

    // Get total vets
    const { count: totalVets, error: vetsError } = await supabase
      .from('vets')
      .select('*', { count: 'exact', head: true });

    if (vetsError) throw vetsError;

    // Get total demands
    const { count: totalDemands, error: demandsError } = await supabase
      .from('demands')
      .select('*', { count: 'exact', head: true });

    if (demandsError) throw demandsError;

    // Get active demands
    const { count: activeDemands, error: activeError } = await supabase
      .from('demands')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    if (activeError) throw activeError;

    // Get total users (clinics + vets + clinic_users)
    const totalUsers = (totalClinics || 0) + (totalVets || 0);

    // Get total applications
    const { count: totalApplications, error: appsError } = await supabase
      .from('position_applications')
      .select('*', { count: 'exact', head: true });

    if (appsError) throw appsError;

    // Get total units
    const { count: totalUnits, error: unitsError } = await supabase
      .from('units')
      .select('*', { count: 'exact', head: true });

    if (unitsError) throw unitsError;

    res.json({
      stats: {
        totalClinics: totalClinics || 0,
        totalVets: totalVets || 0,
        totalDemands: totalDemands || 0,
        activeDemands: activeDemands || 0,
        totalUsers,
        totalApplications: totalApplications || 0,
        totalUnits: totalUnits || 0,
      },
    });
  } catch (error: any) {
    console.error('Error getting system stats:', error);
    res.status(500).json({ error: error.message || 'Failed to get system statistics' });
  }
};

// Helper function to calculate date range based on period
const getDateRange = (period: string, startDate?: string, endDate?: string) => {
  const now = new Date();
  let start: Date;
  let end: Date = new Date(now);

  if (period === 'custom' && startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (period === '7d') {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (period === '30d') {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  } else {
    // Default to 30 days
    start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
};

// Get system statistics with period filter
export const getSystemStatsWithPeriod = async (req: Request, res: Response) => {
  try {
    // Verificar se é admin
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
    }

    const { period = '30d', startDate, endDate } = req.query;
    const { start, end } = getDateRange(period as string, startDate as string, endDate as string);

    // Calculate previous period for growth comparison
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - periodDays);
    const previousEnd = new Date(start);

    // Get new registrations in period - usar supabaseAdmin para contornar RLS
    const { count: newClinics, error: newClinicsError } = await supabaseAdmin
      .from('clinics')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (newClinicsError) throw newClinicsError;

    const { count: newVets, error: newVetsError } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (newVetsError) throw newVetsError;

    const { count: newFreelancers, error: newFreelancersError } = await supabaseAdmin
      .from('freelancers')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (newFreelancersError) throw newFreelancersError;

    // Get previous period counts for growth calculation
    const { count: prevClinics, error: prevClinicsError } = await supabaseAdmin
      .from('clinics')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString());

    if (prevClinicsError) throw prevClinicsError;

    const { count: prevVets, error: prevVetsError } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString());

    if (prevVetsError) throw prevVetsError;

    const { count: prevFreelancers, error: prevFreelancersError } = await supabaseAdmin
      .from('freelancers')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString());

    if (prevFreelancersError) throw prevFreelancersError;

    // Calculate growth percentages
    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const clinicsGrowth = calculateGrowth(newClinics || 0, prevClinics || 0);
    const vetsGrowth = calculateGrowth(newVets || 0, prevVets || 0);
    const freelancersGrowth = calculateGrowth(newFreelancers || 0, prevFreelancers || 0);

    // Get approval rate (approved / total pending + approved)
    const { count: totalPendingVets, error: pendingVetsError } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingVetsError) throw pendingVetsError;

    const { count: totalApprovedVets, error: approvedVetsError } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    if (approvedVetsError) throw approvedVetsError;

    const totalVetsForApproval = (totalPendingVets || 0) + (totalApprovedVets || 0);
    const approvalRate = totalVetsForApproval > 0 
      ? ((totalApprovedVets || 0) / totalVetsForApproval) * 100 
      : 0;

    // Get completed demands in period
    const { count: completedDemands, error: completedError } = await supabaseAdmin
      .from('demands')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'closed')
      .gte('updated_at', start.toISOString())
      .lte('updated_at', end.toISOString());

    if (completedError) throw completedError;

    // Get active vets (vets with applications in period)
    const { data: activeVetsData, error: activeVetsError } = await supabaseAdmin
      .from('position_applications')
      .select('vet_id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (activeVetsError) throw activeVetsError;

    const uniqueActiveVets = new Set(activeVetsData?.map((a: any) => a.vet_id) || []).size;

    // Get total counts
    const { count: totalClinics } = await supabaseAdmin
      .from('clinics')
      .select('*', { count: 'exact', head: true });

    const { count: totalVets } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true });

    const { count: totalFreelancers } = await supabaseAdmin
      .from('freelancers')
      .select('*', { count: 'exact', head: true });

    res.json({
      stats: {
        totalClinics: totalClinics || 0,
        totalVets: totalVets || 0,
        totalFreelancers: totalFreelancers || 0,
        newClinics: newClinics || 0,
        newVets: newVets || 0,
        newFreelancers: newFreelancers || 0,
        clinicsGrowth: Math.round(clinicsGrowth * 100) / 100,
        vetsGrowth: Math.round(vetsGrowth * 100) / 100,
        freelancersGrowth: Math.round(freelancersGrowth * 100) / 100,
        approvalRate: Math.round(approvalRate * 100) / 100,
        completedDemands: completedDemands || 0,
        activeVets: uniqueActiveVets,
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting system stats with period:', error);
    res.status(500).json({ error: error.message || 'Failed to get system statistics with period' });
  }
};

// Get system growth trends for charts
export const getSystemGrowthTrends = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
    }

    const { period = '30d' } = req.query;
    const { start, end } = getDateRange(period as string);

    // Calculate number of days - limitar a 90 dias para evitar queries muito lentas
    const days = Math.min(
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
      90
    );
    const isWeekly = days > 14;

    const trends: any[] = [];
    const startTime = Date.now();
    const maxExecutionTime = 20000; // 20 segundos máximo

    // Generate data points
    for (let i = 0; i < days; i++) {
      // Verificar timeout durante o loop
      if (Date.now() - startTime > maxExecutionTime) {
        console.warn(`[getSystemGrowthTrends] Timeout após ${i} de ${days} dias processados`);
        break;
      }
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dateStr = date.toISOString().split('T')[0];
      const nextDateStr = nextDate.toISOString();

      // Get counts for this day - usar supabaseAdmin para contornar RLS
      const { count: clinics } = await supabaseAdmin
        .from('clinics')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', date.toISOString())
        .lt('created_at', nextDateStr);

      const { count: vets } = await supabaseAdmin
        .from('vets')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', date.toISOString())
        .lt('created_at', nextDateStr);

      const { count: freelancers } = await supabaseAdmin
        .from('freelancers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', date.toISOString())
        .lt('created_at', nextDateStr);

      const { count: demands } = await supabaseAdmin
        .from('demands')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', date.toISOString())
        .lt('created_at', nextDateStr);

      trends.push({
        date: dateStr,
        clinics: clinics || 0,
        vets: vets || 0,
        freelancers: freelancers || 0,
        demands: demands || 0,
      });
    }

    res.json({ trends });
  } catch (error: any) {
    console.error('Error getting growth trends:', error);
    res.status(500).json({ error: error.message || 'Failed to get growth trends' });
  }
};

// Get recent activity unified from multiple sources
export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
    }

    const { limit = '20' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const activities: any[] = [];

    // Get recent clinics - usar supabaseAdmin para contornar RLS
    const { data: recentClinics, error: clinicsError } = await supabaseAdmin
      .from('clinics')
      .select('id, name, created_at, status')
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (!clinicsError && recentClinics) {
      recentClinics.forEach((clinic: any) => {
        activities.push({
          id: clinic.id,
          type: 'clinic_created',
          title: 'Nova clínica cadastrada',
          description: clinic.name,
          icon: 'building',
          color: '#7c3aed',
          timestamp: clinic.created_at,
        });
      });
    }

    // Get recent vets - usar supabaseAdmin para contornar RLS
    const { data: recentVets, error: vetsError } = await supabaseAdmin
      .from('vets')
      .select('id, name, crmv, created_at, status')
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (!vetsError && recentVets) {
      recentVets.forEach((vet: any) => {
        activities.push({
          id: vet.id,
          type: vet.status === 'approved' ? 'vet_approved' : 'vet_created',
          title: vet.status === 'approved' ? 'Veterinário aprovado' : 'Novo veterinário registrado',
          description: `${vet.name}${vet.crmv ? ` - CRMV ${vet.crmv}` : ''}`,
          icon: 'stethoscope',
          color: vet.status === 'approved' ? '#10b981' : '#3b82f6',
          timestamp: vet.created_at,
        });
      });
    }

    // Get recent freelancers - usar supabaseAdmin para contornar RLS
    const { data: recentFreelancers, error: freelancersError } = await supabaseAdmin
      .from('freelancers')
      .select('id, name, created_at, status')
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (!freelancersError && recentFreelancers) {
      recentFreelancers.forEach((freelancer: any) => {
        activities.push({
          id: freelancer.id,
          type: freelancer.status === 'approved' ? 'freelancer_approved' : 'freelancer_created',
          title: freelancer.status === 'approved' ? 'Freelancer aprovado' : 'Novo freelancer registrado',
          description: freelancer.name,
          icon: 'briefcase',
          color: freelancer.status === 'approved' ? '#10b981' : '#8b5cf6',
          timestamp: freelancer.created_at,
        });
      });
    }

    // Get recent demands - usar supabaseAdmin para contornar RLS
    const { data: recentDemands, error: demandsError } = await supabaseAdmin
      .from('demands')
      .select('id, title, created_at, status, clinic_id')
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (!demandsError && recentDemands) {
      // Get clinic names for demands - usar supabaseAdmin para contornar RLS
      const clinicIds = [...new Set(recentDemands.map((d: any) => d.clinic_id).filter(Boolean))];
      const clinicNamesMap: { [key: string]: string } = {};

      if (clinicIds.length > 0) {
        const { data: clinics } = await supabaseAdmin
          .from('clinics')
          .select('id, name')
          .in('id', clinicIds);

        if (clinics) {
          clinics.forEach((clinic: any) => {
            clinicNamesMap[clinic.id] = clinic.name;
          });
        }
      }

      recentDemands.forEach((demand: any) => {
        const clinicName = clinicNamesMap[demand.clinic_id] || 'Clínica';
        activities.push({
          id: demand.id,
          type: demand.status === 'closed' ? 'demand_closed' : 'demand_created',
          title: demand.status === 'closed' ? 'Demanda concluída' : 'Demanda criada',
          description: `${demand.title} - ${clinicName}`,
          icon: 'clipboard',
          color: demand.status === 'closed' ? '#10b981' : '#3b82f6',
          timestamp: demand.created_at,
        });
      });
    }

    // Get audit logs - usar supabaseAdmin para contornar RLS
    const { data: auditLogs, error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (!auditError && auditLogs) {
      auditLogs.forEach((log: any) => {
        let title = '';
        let color = '#3b82f6';
        let icon = 'activity';

        if (log.action.includes('block') || log.action.includes('reject')) {
          title = 'Usuário bloqueado/rejeitado';
          color = '#ef4444';
        } else if (log.action.includes('approve')) {
          title = 'Aprovação realizada';
          color = '#10b981';
        } else if (log.action.includes('create')) {
          title = 'Criação realizada';
        }

        activities.push({
          id: log.id,
          type: 'audit_log',
          title: title || log.action,
          description: log.entity_type || 'Ação do sistema',
          icon,
          color,
          timestamp: log.created_at,
        });
      });
    }

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedActivities = activities.slice(0, limitNum);

    res.json({ activities: limitedActivities });
  } catch (error: any) {
    console.error('Error getting recent activity:', error);
    res.status(500).json({ error: error.message || 'Failed to get recent activity' });
  }
};

// Get top performers (clinics or vets)
export const getTopPerformers = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
    }

    const { type = 'clinics', limit = '5' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    if (type === 'clinics') {
      // Get top clinics by number of demands created - usar supabaseAdmin para contornar RLS
      const { data: clinics, error: clinicsError } = await supabaseAdmin
        .from('clinics')
        .select('id, name, created_at, status');

      if (clinicsError) throw clinicsError;

      const clinicsWithCounts = await Promise.all(
        (clinics || []).map(async (clinic: any) => {
          const { count } = await supabaseAdmin
            .from('demands')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', clinic.id);

          return {
            id: clinic.id,
            name: clinic.name,
            metric: count || 0,
            status: clinic.status,
            created_at: clinic.created_at,
          };
        })
      );

      clinicsWithCounts.sort((a, b) => b.metric - a.metric);
      const topClinics = clinicsWithCounts.slice(0, limitNum);

      res.json({ performers: topClinics, type: 'clinics' });
    } else if (type === 'vets') {
      // Get top vets by number of applications - usar supabaseAdmin para contornar RLS
      const { data: vets, error: vetsError } = await supabaseAdmin
        .from('vets')
        .select('id, name, crmv, created_at, status');

      if (vetsError) throw vetsError;

      const vetsWithCounts = await Promise.all(
        (vets || []).map(async (vet: any) => {
          const { count } = await supabaseAdmin
            .from('position_applications')
            .select('*', { count: 'exact', head: true })
            .eq('vet_id', vet.id);

          return {
            id: vet.id,
            name: vet.name,
            crmv: vet.crmv,
            metric: count || 0,
            status: vet.status,
            created_at: vet.created_at,
          };
        })
      );

      vetsWithCounts.sort((a, b) => b.metric - a.metric);
      const topVets = vetsWithCounts.slice(0, limitNum);

      res.json({ performers: topVets, type: 'vets' });
    } else {
      res.status(400).json({ error: 'Invalid type. Use "clinics" or "vets"' });
    }
  } catch (error: any) {
    console.error('Error getting top performers:', error);
    res.status(500).json({ error: error.message || 'Failed to get top performers' });
  }
};

// Get system insights (automated insights based on data)
export const getSystemInsights = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
    }

    const insights: any[] = [];
    const isDevelopment = process.env.NODE_ENV === 'development';
    // Thresholds mais baixos em desenvolvimento para mostrar insights mesmo com poucos dados
    const growthThreshold = isDevelopment ? 10 : 20;
    const pendingThreshold = isDevelopment ? 1 : 5;

    // Get data for last 7 days and previous 7 days
    const now = new Date();
    const last7DaysStart = new Date(now);
    last7DaysStart.setDate(last7DaysStart.getDate() - 7);
    const prev7DaysStart = new Date(last7DaysStart);
    prev7DaysStart.setDate(prev7DaysStart.getDate() - 7);

    // Compare vet registrations - usar supabaseAdmin para contornar RLS
    const { count: vetsLast7Days } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', last7DaysStart.toISOString())
      .lte('created_at', now.toISOString());

    const { count: vetsPrev7Days } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', prev7DaysStart.toISOString())
      .lt('created_at', last7DaysStart.toISOString());

    // Insight: Crescimento de vets (threshold ajustado por ambiente)
    if (vetsLast7Days !== null && vetsPrev7Days !== null) {
      const growth = vetsPrev7Days > 0 
        ? ((vetsLast7Days - vetsPrev7Days) / vetsPrev7Days) * 100 
        : (vetsLast7Days > 0 ? 100 : 0);

      if (Math.abs(growth) > growthThreshold) {
        insights.push({
          type: growth > 0 ? 'positive' : 'warning',
          title: `Crescimento de ${Math.round(growth)}% em cadastros de veterinários`,
          message: `Esta semana houve ${vetsLast7Days} novos cadastros de veterinários, ${growth > 0 ? 'aumento' : 'redução'} de ${Math.round(Math.abs(growth))}% em relação à semana anterior.`,
          icon: 'trending-up',
        });
      } else if (isDevelopment && vetsLast7Days > 0) {
        // Em desenvolvimento, mostrar insight mesmo com crescimento menor
        insights.push({
          type: 'info',
          title: `${vetsLast7Days} novo(s) cadastro(s) de veterinário(s) esta semana`,
          message: `Foram registrados ${vetsLast7Days} novo(s) veterinário(s) nos últimos 7 dias.`,
          icon: 'user-plus',
        });
      }
    }

    // Check for new demands - usar supabaseAdmin para contornar RLS
    const { count: demandsLast7Days } = await supabaseAdmin
      .from('demands')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', last7DaysStart.toISOString())
      .lte('created_at', now.toISOString());

    // Insight: High vet growth but no new demands
    if (vetsLast7Days && vetsLast7Days > 0 && demandsLast7Days === 0) {
      insights.push({
        type: 'warning',
        title: 'Aumento de cadastros sem novas demandas',
        message: `Esta semana houve um aumento de ${vetsLast7Days} cadastros de veterinários, mas nenhuma nova demanda criada. Pode indicar baixa adesão das clínicas.`,
        icon: 'alert-triangle',
      });
    }

    // Check approval rate - usar supabaseAdmin para contornar RLS
    const { count: pendingVets } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: pendingFreelancers } = await supabaseAdmin
      .from('freelancers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: approvedVets } = await supabaseAdmin
      .from('vets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    // Insight: Vets pendentes (threshold ajustado por ambiente)
    if (pendingVets !== null && pendingVets >= pendingThreshold) {
      insights.push({
        type: 'info',
        title: `${pendingVets} veterinário(s) aguardando aprovação`,
        message: `Há ${pendingVets} cadastro(s) de veterinário(s) pendente(s) de análise. Considere revisar as aprovações pendentes.`,
        icon: 'clock',
      });
    }

    // Insight: Freelancers pendentes
    if (pendingFreelancers !== null && pendingFreelancers >= pendingThreshold) {
      insights.push({
        type: 'info',
        title: `${pendingFreelancers} freelancer(s) aguardando aprovação`,
        message: `Há ${pendingFreelancers} cadastro(s) de freelancer(s) pendente(s) de análise.`,
        icon: 'clock',
      });
    }

    // Check for inactive clinics (no demands in last 30 days)
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: allClinics } = await supabaseAdmin
      .from('clinics')
      .select('id, name');

    if (allClinics) {
      const inactiveClinics = await Promise.all(
        allClinics.map(async (clinic: any) => {
          const { count } = await supabaseAdmin
            .from('demands')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', clinic.id)
            .gte('created_at', thirtyDaysAgo.toISOString());

          return { clinic, hasActivity: (count || 0) > 0 };
        })
      );

      const inactive = inactiveClinics.filter((c: any) => !c.hasActivity);
      if (inactive.length > 0 && (isDevelopment || inactive.length <= 10)) {
        insights.push({
          type: 'info',
          title: `${inactive.length} clínica(s) inativa(s)`,
          message: `${inactive.length} clínica(s) não criaram demandas nos últimos 30 dias. Considere verificar o engajamento.`,
          icon: 'building',
        });
      }
    }

    // Em desenvolvimento, adicionar insight geral se não houver nenhum
    if (isDevelopment && insights.length === 0) {
      // Verificar se há dados no sistema
      const { count: totalVets } = await supabaseAdmin
        .from('vets')
        .select('*', { count: 'exact', head: true });
      
      const { count: totalClinics } = await supabaseAdmin
        .from('clinics')
        .select('*', { count: 'exact', head: true });

      if (totalVets !== null && totalClinics !== null) {
        insights.push({
          type: 'info',
          title: 'Sistema em funcionamento',
          message: `O sistema possui ${totalClinics} clínica(s) e ${totalVets} veterinário(s) cadastrado(s).`,
          icon: 'activity',
        });
      }
    }

    console.log(`[getSystemInsights] Gerados ${insights.length} insights (ambiente: ${isDevelopment ? 'development' : 'production'})`);
    res.json({ insights });
  } catch (error: any) {
    console.error('Error getting system insights:', error);
    res.status(500).json({ error: error.message || 'Failed to get system insights' });
  }
};

