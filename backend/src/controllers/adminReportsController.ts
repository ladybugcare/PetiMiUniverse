import type { Request, Response } from 'express';
import { supabase } from '../config/supabase';

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

// Get admin overview - métricas gerais de atividade e performance
export const getAdminOverview = async (req: Request, res: Response) => {
  const { period = '30d', startDate, endDate } = req.query;

  try {
    const { start, end } = getDateRange(period as string, startDate as string, endDate as string);

    // Get all clinics (for total count and approval rate)
    const { data: allClinics, error: clinicsError } = await supabase
      .from('clinics')
      .select('id, status, created_at')
      .is('deleted_at', null);

    if (clinicsError) throw clinicsError;

    // Calculate active/inactive clinics
    // Active = clinics with status 'active' that had activity (login or demand) in last 30 days
    const activityThreshold = new Date();
    activityThreshold.setDate(activityThreshold.getDate() - 30);

    // Get clinics with demands in the last 30 days
    const { data: clinicsWithDemands } = await supabase
      .from('demands')
      .select('clinic_id')
      .gte('created_at', activityThreshold.toISOString())
      .not('clinic_id', 'is', null);

    const activeClinicIds = new Set(clinicsWithDemands?.map(d => d.clinic_id) || []);

    // Get clinics with recent logins (via clinic_users first_login_at or updated_at)
    const { data: clinicUsersWithActivity } = await supabase
      .from('clinic_users')
      .select('clinic_id')
      .or(`first_login_at.gte.${activityThreshold.toISOString()},updated_at.gte.${activityThreshold.toISOString()}`);

    clinicUsersWithActivity?.forEach(cu => {
      if (cu.clinic_id) activeClinicIds.add(cu.clinic_id);
    });

    // Count active clinics (status active AND has activity)
    const activeClinics = allClinics?.filter(c => 
      c.status === 'active' && activeClinicIds.has(c.id)
    ).length || 0;

    // Count inactive clinics (status active but no activity, or status inactive)
    const inactiveClinics = allClinics?.filter(c => 
      c.status === 'active' && !activeClinicIds.has(c.id)
    ).length || 0;

    // Get new registrations in period
    const { data: newClinics, error: newClinicsError } = await supabase
      .from('clinics')
      .select('id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .is('deleted_at', null);

    if (newClinicsError) throw newClinicsError;

    const { data: newUnits, error: newUnitsError } = await supabase
      .from('units')
      .select('id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (newUnitsError) throw newUnitsError;

    const { data: newVets, error: newVetsError } = await supabase
      .from('vets')
      .select('id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (newVetsError) throw newVetsError;

    const newClinicsCount = newClinics?.length || 0;
    const newUnitsCount = newUnits?.length || 0;
    const newVetsCount = newVets?.length || 0;
    const totalNewRegistrations = newClinicsCount + newUnitsCount + newVetsCount;

    // Get demands in period
    const { data: demands, error: demandsError } = await supabase
      .from('demands')
      .select('id, status, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (demandsError) throw demandsError;

    const demandsByStatus = {
      open: demands?.filter(d => d.status === 'open').length || 0,
      in_progress: demands?.filter(d => d.status === 'in_progress').length || 0,
      closed: demands?.filter(d => d.status === 'closed').length || 0,
      cancelled: demands?.filter(d => d.status === 'cancelled').length || 0,
    };

    const openDemands = demandsByStatus.open;
    const closedDemands = demandsByStatus.closed;

    // Calculate average approval rate
    const totalClinics = allClinics?.length || 0;
    const approvedClinics = allClinics?.filter(c => c.status === 'active').length || 0;
    const averageApprovalRate = totalClinics > 0
      ? Math.round((approvedClinics / totalClinics) * 100 * 100) / 100
      : 0;

    // Calculate growth rate (compare new registrations in current period vs previous period)
    const previousPeriodStart = new Date(start);
    const previousPeriodEnd = new Date(start);
    previousPeriodEnd.setTime(previousPeriodEnd.getTime() - 1);
    const previousPeriodDuration = end.getTime() - start.getTime();
    previousPeriodStart.setTime(previousPeriodStart.getTime() - previousPeriodDuration);

    const { data: previousNewClinics } = await supabase
      .from('clinics')
      .select('id')
      .gte('created_at', previousPeriodStart.toISOString())
      .lte('created_at', previousPeriodEnd.toISOString())
      .is('deleted_at', null);

    const { data: previousNewUnits } = await supabase
      .from('units')
      .select('id')
      .gte('created_at', previousPeriodStart.toISOString())
      .lte('created_at', previousPeriodEnd.toISOString());

    const { data: previousNewVets } = await supabase
      .from('vets')
      .select('id')
      .gte('created_at', previousPeriodStart.toISOString())
      .lte('created_at', previousPeriodEnd.toISOString());

    const previousTotalRegistrations = (previousNewClinics?.length || 0) + 
                                       (previousNewUnits?.length || 0) + 
                                       (previousNewVets?.length || 0);

    const growthRate = previousTotalRegistrations > 0
      ? Math.round(((totalNewRegistrations - previousTotalRegistrations) / previousTotalRegistrations) * 100 * 100) / 100
      : totalNewRegistrations > 0 ? 100 : 0;

    // Get top specialties by demand volume
    // First get demands in period
    const demandIds = demands?.map(d => d.id) || [];
    
    let positions: any[] = [];
    if (demandIds.length > 0) {
      const { data: positionsData, error: positionsError } = await supabase
        .from('demand_positions')
        .select('specialty, master_demand_id')
        .in('master_demand_id', demandIds);

      if (positionsError) throw positionsError;
      positions = positionsData || [];
    }

    const specialtyCounts: { [key: string]: number } = {};
    positions?.forEach(position => {
      if (!specialtyCounts[position.specialty]) {
        specialtyCounts[position.specialty] = 0;
      }
      specialtyCounts[position.specialty]++;
    });

    // Sort specialties by count and get top 5
    const topSpecialties = Object.entries(specialtyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([specialty, count]) => ({ specialty, count }));

    // Calculate average demands per specialty
    const uniqueSpecialties = Object.keys(specialtyCounts).length;
    const averageDemandsPerSpecialty = uniqueSpecialties > 0
      ? Math.round((Object.values(specialtyCounts).reduce((sum, count) => sum + count, 0) / uniqueSpecialties) * 100) / 100
      : 0;

    res.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      activity: {
        activeClinics,
        inactiveClinics,
        newClinics: newClinicsCount,
        newUnits: newUnitsCount,
        newVets: newVetsCount,
        totalNewRegistrations,
        openDemands,
        closedDemands,
        demandsByStatus,
      },
      performance: {
        averageApprovalRate,
        growthRate,
        topSpecialties,
        averageDemandsPerSpecialty,
      },
    });
  } catch (error: any) {
    console.error('Error getting admin overview:', error);
    res.status(500).json({ error: error.message || 'Failed to get admin overview' });
  }
};

// Get admin specialties - dados sobre especialidades mais ativas
export const getAdminSpecialties = async (req: Request, res: Response) => {
  const { period = '30d', startDate, endDate } = req.query;

  try {
    const { start, end } = getDateRange(period as string, startDate as string, endDate as string);

    // Get demands in period
    const { data: demands, error: demandsError } = await supabase
      .from('demands')
      .select('id')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (demandsError) throw demandsError;

    // Get positions for these demands
    const demandIds = demands?.map(d => d.id) || [];
    let positions: any[] = [];
    
    if (demandIds.length > 0) {
      const { data: positionsData, error: positionsError } = await supabase
        .from('demand_positions')
        .select('specialty, master_demand_id')
        .in('master_demand_id', demandIds);

      if (positionsError) throw positionsError;
      positions = positionsData || [];
    }

    // Count specialties
    const specialtyCounts: { [key: string]: number } = {};
    positions.forEach(position => {
      if (!specialtyCounts[position.specialty]) {
        specialtyCounts[position.specialty] = 0;
      }
      specialtyCounts[position.specialty]++;
    });

    const totalPositions = positions.length;

    // Sort specialties by count and calculate percentages
    const topSpecialties = Object.entries(specialtyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([specialty, count]) => ({
        specialty,
        count,
        percentage: totalPositions > 0
          ? Math.round((count / totalPositions) * 100 * 100) / 100
          : 0,
      }));

    res.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      topSpecialties,
      distribution: specialtyCounts,
    });
  } catch (error: any) {
    console.error('Error getting admin specialties:', error);
    res.status(500).json({ error: error.message || 'Failed to get admin specialties' });
  }
};

// Get admin usage - dados de uso, engajamento e saúde do sistema
export const getAdminUsage = async (req: Request, res: Response) => {
  const { period = '30d', startDate, endDate } = req.query;

  try {
    const { start, end } = getDateRange(period as string, startDate as string, endDate as string);

    // Get active users (users with login activity in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get unique users from clinic_users with recent activity
    const { data: activeClinicUsers, error: clinicUsersError } = await supabase
      .from('clinic_users')
      .select('user_id')
      .or(`first_login_at.gte.${thirtyDaysAgo.toISOString()},updated_at.gte.${thirtyDaysAgo.toISOString()}`);

    if (clinicUsersError) throw clinicUsersError;

    // Get unique users from vets with recent activity (using created_at as proxy for activity)
    // In a real system, you'd track logins separately
    const { data: activeVets, error: vetsError } = await supabase
      .from('vets')
      .select('id')
      .gte('updated_at', thirtyDaysAgo.toISOString());

    if (vetsError) throw vetsError;

    // Count unique active users
    const activeUserIds = new Set<string>();
    activeClinicUsers?.forEach(cu => {
      if (cu.user_id) activeUserIds.add(cu.user_id);
    });
    activeVets?.forEach(v => {
      if (v.id) activeUserIds.add(v.id);
    });

    const activeUsers = activeUserIds.size;

    // Get demands in period for rejection/cancellation rates
    const { data: demands, error: demandsError } = await supabase
      .from('demands')
      .select('id, status')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (demandsError) throw demandsError;

    const totalDemands = demands?.length || 0;
    const rejectedDemands = demands?.filter(d => d.status === 'rejected').length || 0;
    const cancelledDemands = demands?.filter(d => d.status === 'cancelled').length || 0;

    const rejectionRate = totalDemands > 0
      ? Math.round((rejectedDemands / totalDemands) * 100 * 100) / 100
      : 0;

    const cancellationRate = totalDemands > 0
      ? Math.round((cancelledDemands / totalDemands) * 100 * 100) / 100
      : 0;

    // Get unique logins in period (using clinic_users activity as proxy)
    const { data: loginsInPeriod, error: loginsError } = await supabase
      .from('clinic_users')
      .select('user_id')
      .or(`first_login_at.gte.${start.toISOString()},updated_at.gte.${start.toISOString()}`)
      .lte('updated_at', end.toISOString());

    if (loginsError) throw loginsError;

    const uniqueLogins = new Set(loginsInPeriod?.map(l => l.user_id).filter(Boolean) || []).size;

    res.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      activeUsers,
      rejectionRate,
      cancellationRate,
      uniqueLogins,
    });
  } catch (error: any) {
    console.error('Error getting admin usage:', error);
    res.status(500).json({ error: error.message || 'Failed to get admin usage' });
  }
};

