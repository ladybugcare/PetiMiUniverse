import type { Request, Response } from 'express'
import { supabase } from '../config/supabase'

interface DemandBody {
  title: string
  description: string
  clinic_id: string
  category: 'vet' | 'freelancer' | 'clinic' | 'other'
  required_specialties: string[]
  demand_date: string
  start_time: string
  duration_hours: number
  status?: string
  payment?: number
}

export const createDemand = async (req: Request<{}, {}, DemandBody>, res: Response) => {
  const { 
    title, 
    description, 
    clinic_id, 
    category,
    required_specialties,
    demand_date,
    start_time,
    duration_hours,
    status, 
    payment 
  } = req.body

  const { data, error } = await supabase
    .from('demands')
    .insert([{ 
      title, 
      description, 
      clinic_id, 
      category: category || 'vet',
      required_specialties: required_specialties || [],
      demand_date,
      start_time,
      duration_hours,
      status: status || 'open', 
      payment 
    }])
    .select()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ demand: data[0] })
}

export const getDemands = async (req: Request, res: Response) => {
  const { user_role, user_id } = req.query
  
  let query = supabase
    .from('demands')
    .select('*')
    .eq('status', 'open')
  
  // Filter by category based on user role
  // Professionals see demands that match their category (job opportunities)
  if (user_role === 'vet') {
    query = query.eq('category', 'vet')
  } else if (user_role === 'freelancer') {
    query = query.eq('category', 'freelancer')
  } else if (user_role === 'clinic' && user_id) {
    // Clinics only see their own demands
    query = query.eq('clinic_id', user_id)
  }
  
  const { data, error } = await query.order('demand_date', { ascending: true })
  
  if (error) return res.status(400).json({ error: error.message })
  res.json({ demands: data })
}

// Get recent activity for a clinic
export const getRecentActivity = async (req: Request, res: Response) => {
  const { clinic_id, unit_id, limit = '10' } = req.query;

  if (!clinic_id) {
    return res.status(400).json({ error: 'clinic_id is required' });
  }

  try {
    let query = supabase
      .from('demands')
      .select('*')
      .eq('clinic_id', clinic_id as string);

    if (unit_id) {
      query = query.eq('unit_id', unit_id as string);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string));

    if (error) throw error;

    res.json({ demands: data || [] });
  } catch (error: any) {
    console.error('Error getting recent activity:', error);
    res.status(500).json({ error: error.message || 'Failed to get recent activity' });
  }
};

// Get demands by unit
export const getDemandsByUnit = async (req: Request<{ unitId: string }>, res: Response) => {
  const { unitId } = req.params;

  try {
    const { data, error } = await supabase
      .from('demands')
      .select('*')
      .eq('unit_id', unitId)
      .order('demand_date', { ascending: true });

    if (error) throw error;

    res.json({ demands: data || [] });
  } catch (error: any) {
    console.error('Error getting demands by unit:', error);
    res.status(500).json({ error: error.message || 'Failed to get demands by unit' });
  }
};

// Get all demands (admin only, with optional filters)
export const getAllDemands = async (req: Request, res: Response) => {
  const { status, clinic_id } = req.query;

  try {
    let query = supabase
      .from('demands')
      .select('*');

    if (status && status !== 'all') {
      query = query.eq('status', status as string);
    }

    if (clinic_id) {
      query = query.eq('clinic_id', clinic_id as string);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ demands: data || [] });
  } catch (error: any) {
    console.error('Error getting all demands:', error);
    res.status(500).json({ error: error.message || 'Failed to get demands' });
  }
};

// Get demand by ID
export const getDemandById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('demands')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({ demand: data });
  } catch (error: any) {
    console.error('Error getting demand by ID:', error);
    res.status(500).json({ error: error.message || 'Failed to get demand' });
  }
};

// Update demand
export const updateDemand = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;
    delete updates.clinic_id; // Prevent changing ownership

    const { data, error } = await supabase
      .from('demands')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Demand not found' });
    }

    res.json({ demand: data[0] });
  } catch (error: any) {
    console.error('Error updating demand:', error);
    res.status(500).json({ error: error.message || 'Failed to update demand' });
  }
};

// Update demand status
export const updateDemandStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (!['open', 'in_progress', 'closed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const { data, error } = await supabase
      .from('demands')
      .update({ status })
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Demand not found' });
    }

    res.json({ demand: data[0] });
  } catch (error: any) {
    console.error('Error updating demand status:', error);
    res.status(500).json({ error: error.message || 'Failed to update demand status' });
  }
};

// Delete demand (soft delete)
export const deleteDemand = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Soft delete by updating a deleted flag
    const { data, error } = await supabase
      .from('demands')
      .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Demand not found' });
    }

    res.json({ message: 'Demand deleted successfully', demand: data[0] });
  } catch (error: any) {
    console.error('Error deleting demand:', error);
    res.status(500).json({ error: error.message || 'Failed to delete demand' });
  }
};

// Get applications for a demand
export const getDemandApplications = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        vets (
          id,
          name,
          email,
          crmv,
          specialties,
          experience
        )
      `)
      .eq('demand_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ applications: data || [] });
  } catch (error: any) {
    console.error('Error getting demand applications:', error);
    res.status(500).json({ error: error.message || 'Failed to get applications' });
  }
};
