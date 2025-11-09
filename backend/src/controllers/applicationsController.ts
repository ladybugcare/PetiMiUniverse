import type { Request, Response } from 'express'
import { supabase, supabaseAdmin } from '../config/supabase'
import { createNotification } from './notificationsController'

interface ApplicationBody {
  demand_id: string
  vet_id: string
}

export const applyToDemand = async (req: Request<{}, {}, ApplicationBody>, res: Response) => {
  const { demand_id, vet_id } = req.body

  try {
    // Create application
    const { data, error } = await supabase
      .from('applications')
      .insert([{ demand_id, vet_id, status: 'pending' }])
      .select()

    if (error) return res.status(400).json({ error })

    const application = data[0]

    // Get demand and vet info for notification
    const { data: demand } = await supabase
      .from('demands')
      .select('title, clinic_id')
      .eq('id', demand_id)
      .single()

    const { data: vet } = await supabase
      .from('vets')
      .select('name')
      .eq('id', vet_id)
      .single()

    // Create notification for clinic
    if (demand && vet) {
      await createNotification({
        user_id: demand.clinic_id,
        type: 'application_received',
        title: 'Nova Candidatura',
        message: `${vet.name} se candidatou à vaga "${demand.title}"`,
        link: `/demands/${demand_id}`,
        entity_type: 'application',
        entity_id: application.id
      })
    }

    res.status(201).json({ application })
  } catch (error: any) {
    console.error('Error applying to demand:', error)
    res.status(500).json({ error: error.message || 'Failed to apply to demand' })
  }
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

// Get applications by vet or freelancer (generic route that works for both)
export const getApplicationsByUser = async (
  req: Request<{ userId: string }>,
  res: Response
) => {
  const { userId } = req.params

  try {
    // Check if user is a vet or freelancer
    const { data: vet } = await supabase
      .from('vets')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    const { data: freelancer } = await supabase
      .from('freelancers')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (!vet && !freelancer) {
      return res.status(404).json({ error: 'User not found as vet or freelancer' })
    }

    // Get applications - the vet_id field can contain either vet or freelancer ID
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        demands (
          id,
          title,
          description,
          clinic_id,
          clinics (
            id,
            name
          )
        )
      `)
      .eq('vet_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({ applications: data || [] })
  } catch (error: any) {
    console.error('Error getting applications by user:', error)
    res.status(500).json({ error: error.message || 'Failed to get applications' })
  }
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
    const { data: applications, error } = await supabase
      .from('applications')
      .select('*')
      .in('demand_id', demandIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch vet information for each application
    const vetIds = [...new Set((applications || []).map(app => app.vet_id))];
    const vetMap = new Map();
    
    if (vetIds.length > 0) {
      const { data: vets, error: vetsError } = await supabase
        .from('vets')
        .select('id, name, email, crmv')
        .in('id', vetIds);
      
      if (!vetsError && vets) {
        vets.forEach(vet => {
          vetMap.set(vet.id, vet);
        });
      }
    }

    // Map applications with vet information
    const applicationsWithVets = (applications || []).map(app => ({
      ...app,
      vets: vetMap.get(app.vet_id) || null,
    }));

    res.json({ applications: applicationsWithVets });
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
      .eq('status', 'pending');

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error: any) {
    console.error('Error getting pending applications count:', error);
    res.status(500).json({ error: error.message || 'Failed to get pending applications count' });
  }
};
