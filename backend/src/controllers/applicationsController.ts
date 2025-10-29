import type { Request, Response } from 'express'
import { supabase } from '../config/supabase'

interface ApplicationBody {
  demand_id: string
  vet_id: string
}

export const applyToDemand = async (req: Request<{}, {}, ApplicationBody>, res: Response) => {
  const { demand_id, vet_id } = req.body

  const { data, error } = await supabase
    .from('applications')
    .insert([{ demand_id, vet_id, status: 'applied' }])
    .select()

  if (error) return res.status(400).json({ error })
  res.status(201).json({ application: data[0] })
}

// Tipando o param da rota
export const getApplicationsByDemand = async (
  req: Request<{ demand_id: string }>,
  res: Response
) => {
  const { demand_id } = req.params

  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('demand_id', demand_id)

  if (error) return res.status(400).json({ error })
  res.json({ applications: data })
}

// Get applications by clinic (all applications for clinic's demands)
export const getApplicationsByClinic = async (req: Request, res: Response) => {
  const { clinic_id } = req.query;

  if (!clinic_id) {
    return res.status(400).json({ error: 'clinic_id is required' });
  }

  try {
    // First get all demands for this clinic
    const { data: demands, error: demandsError } = await supabase
      .from('demands')
      .select('id')
      .eq('clinic_id', clinic_id as string);

    if (demandsError) throw demandsError;

    const demandIds = demands?.map(d => d.id) || [];

    if (demandIds.length === 0) {
      return res.json({ applications: [] });
    }

    // Then get all applications for those demands
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .in('demand_id', demandIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ applications: data || [] });
  } catch (error: any) {
    console.error('Error getting applications by clinic:', error);
    res.status(500).json({ error: error.message || 'Failed to get applications' });
  }
};

// Get applications by unit
export const getApplicationsByUnit = async (req: Request<{ unitId: string }>, res: Response) => {
  const { unitId } = req.params;

  try {
    // First get all demands for this unit
    const { data: demands, error: demandsError } = await supabase
      .from('demands')
      .select('id')
      .eq('unit_id', unitId);

    if (demandsError) throw demandsError;

    const demandIds = demands?.map(d => d.id) || [];

    if (demandIds.length === 0) {
      return res.json({ applications: [] });
    }

    // Then get all applications for those demands
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .in('demand_id', demandIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ applications: data || [] });
  } catch (error: any) {
    console.error('Error getting applications by unit:', error);
    res.status(500).json({ error: error.message || 'Failed to get applications' });
  }
};

// Get pending applications count
export const getPendingApplicationsCount = async (req: Request, res: Response) => {
  const { clinic_id, unit_id } = req.query;

  if (!clinic_id) {
    return res.status(400).json({ error: 'clinic_id is required' });
  }

  try {
    // Get demands for the clinic/unit
    let demandsQuery = supabase
      .from('demands')
      .select('id')
      .eq('clinic_id', clinic_id as string);

    if (unit_id) {
      demandsQuery = demandsQuery.eq('unit_id', unit_id as string);
    }

    const { data: demands, error: demandsError } = await demandsQuery;

    if (demandsError) throw demandsError;

    const demandIds = demands?.map(d => d.id) || [];

    if (demandIds.length === 0) {
      return res.json({ count: 0 });
    }

    // Count pending applications
    const { count, error } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .in('demand_id', demandIds)
      .eq('status', 'applied');

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error: any) {
    console.error('Error getting pending applications count:', error);
    res.status(500).json({ error: error.message || 'Failed to get pending applications count' });
  }
};
