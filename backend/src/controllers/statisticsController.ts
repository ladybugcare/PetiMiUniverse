import type { Request, Response } from 'express';
import { supabase } from '../config/supabase';

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

    res.json({
      stats: {
        totalDemands: totalDemands || 0,
        openDemands: openDemands || 0,
        totalApplications: applicationsCount,
        pendingApplications: pendingApplicationsCount,
        totalUsers: totalUsers || 0,
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

    const acceptedDemandIds = acceptedApps?.map(a => a.demand_positions.master_demand_id) || [];
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
    // Get total clinics
    const { count: totalClinics, error: clinicsError } = await supabase
      .from('clinics')
      .select('*', { count: 'exact', head: true });

    if (clinicsError) throw clinicsError;

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

