import type { Request, Response } from 'express'
import { supabase, supabaseAdmin } from '../config/supabase'
import { createNotification } from './notificationsController'
import { applyPrivacyFilter } from '../middleware/privacyGuard.js'
import { DemandLifecycleService } from '../services/demandLifecycleService.js'
import { logger } from '../utils/logger.js'
import { checkClinicAccess } from '../middleware/authMiddleware.js'

interface ApplicationBody {
  demand_id: string
  vet_id: string
}

export const applyToDemand = async (req: Request<{}, {}, ApplicationBody>, res: Response) => {
  const { demand_id, vet_id } = req.body

  try {
    // Verificar se já existe aplicação (incluindo convites)
    const { data: existing } = await supabaseAdmin
      .from('demand_applications')
      .select('id, status')
      .eq('demand_id', demand_id)
      .eq('vet_id', vet_id)
      .maybeSingle()

    if (existing) {
      // Se já existe e está como 'invited', atualizar para 'applied'
      if (existing.status === 'invited') {
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('demand_applications')
          .update({
            status: 'applied',
            applied_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (updateError) throw updateError

        // Atualizar status da demanda
        await DemandLifecycleService.calculateDemandStatus(demand_id).then((newStatus) => {
          DemandLifecycleService.updateDemandStatus(demand_id, newStatus)
        })

        return res.json({ application: updated })
      }

      return res.status(400).json({ error: 'Você já se candidatou a esta demanda' })
    }

    // Criar nova aplicação usando demand_applications
    const { data, error } = await supabaseAdmin
      .from('demand_applications')
      .insert([{ 
        demand_id, 
        vet_id, 
        status: 'applied',
        applied_at: new Date().toISOString(),
      }])
      .select()

    if (error) return res.status(400).json({ error })

    const application = data[0]

    // Atualizar status da demanda
    await DemandLifecycleService.calculateDemandStatus(demand_id).then((newStatus) => {
      DemandLifecycleService.updateDemandStatus(demand_id, newStatus)
    })

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

    logger.info('Aplicação criada', {
      applicationId: application.id,
      demandId: demand_id,
      vetId: vet_id,
      correlationId: (req as any).correlationId,
    })

    res.status(201).json({ application })
  } catch (error: any) {
    logger.error('Erro ao candidatar-se à demanda', {
      demandId: demand_id,
      vetId: vet_id,
      error: error.message,
      correlationId: (req as any).correlationId,
    })
    res.status(500).json({ error: error.message || 'Failed to apply to demand' })
  }
}

// Tipando o param da rota
export const getApplicationsByDemand = async (
  req: Request<{ demand_id: string }>,
  res: Response
) => {
  const { demand_id } = req.params

  try {
    let query = supabaseAdmin
      .from('demand_applications')
      .select(`
        *,
        vets (
          id,
          name,
          email,
          crmv,
          specialties
        ),
        freelancers (
          id,
          name,
          email,
          document_number
        )
      `)
    .eq('demand_id', demand_id)

    // Aplicar filtro de privacidade
    query = applyPrivacyFilter(query, req)

    const { data, error } = await query.order('applied_at', { ascending: false })

    if (error) throw error

    logger.info('Aplicações buscadas por demanda', {
      demandId: demand_id,
      count: data?.length || 0,
      correlationId: (req as any).correlationId,
    })

    res.json({ applications: data || [] })
  } catch (error: any) {
    logger.error('Erro ao buscar aplicações por demanda', {
      demandId: demand_id,
      error: error.message,
      correlationId: (req as any).correlationId,
    })
    res.status(500).json({ error: error.message || 'Failed to get applications' })
  }
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

    // Get applications usando demand_applications
    // Buscar tanto por vet_id quanto por freelancer_id
    const { data: vetApps, error: vetError } = await supabaseAdmin
      .from('demand_applications')
      .select(`
        *,
        demands (
          id,
          title,
          description,
          clinic_id,
          vacancies,
          filled_positions,
          clinics (
            id,
            name
          )
        )
      `)
      .eq('vet_id', userId)
      .order('applied_at', { ascending: false })

    const { data: freelancerApps, error: freelancerError } = await supabaseAdmin
      .from('demand_applications')
      .select(`
        *,
        demands (
          id,
          title,
          description,
          clinic_id,
          vacancies,
          filled_positions,
          clinics (
            id,
            name
          )
        )
      `)
      .eq('freelancer_id', userId)
      .order('applied_at', { ascending: false })

    if (vetError) throw vetError
    if (freelancerError) throw freelancerError

    // Combinar resultados
    const allApplications = [...(vetApps || []), ...(freelancerApps || [])]
      .sort((a, b) => {
        const dateA = new Date(a.applied_at || a.created_at).getTime()
        const dateB = new Date(b.applied_at || b.created_at).getTime()
        return dateB - dateA
      })

    res.json({ applications: allApplications })
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

    // Then get all applications for those demands usando demand_applications
    const { data: applications, error } = await supabaseAdmin
      .from('demand_applications')
      .select(`
        *,
        vets (
          id,
          name,
          email,
          crmv,
          specialties
        ),
        freelancers (
          id,
          name,
          email,
          document_number
        )
      `)
      .in('demand_id', demandIds)
      .order('applied_at', { ascending: false });

    if (error) throw error;

    // Mapear aplicações com informações do vet/freelancer
    const applicationsWithUsers = (applications || []).map(app => ({
      ...app,
      vets: app.vets || null,
      freelancers: app.freelancers || null,
    }));

    res.json({ applications: applicationsWithUsers });
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

    // Then get all applications for those demands usando demand_applications
    let query = supabaseAdmin
      .from('demand_applications')
      .select('*')
      .in('demand_id', demandIds)
      .order('applied_at', { ascending: false });

    // Aplicar filtro de privacidade
    query = applyPrivacyFilter(query, req);

    const { data, error } = await query;

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

    // Count pending applications usando demand_applications
    // Contar aplicações com status 'applied' ou 'invited' (pendentes)
    let query = supabaseAdmin
      .from('demand_applications')
      .select('*', { count: 'exact', head: true })
      .in('demand_id', demandIds)
      .in('status', ['applied', 'invited']);

    // Aplicar filtro de privacidade
    query = applyPrivacyFilter(query, req);

    const { count, error } = await query;

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error: any) {
    console.error('Error getting pending applications count:', error);
    res.status(500).json({ error: error.message || 'Failed to get pending applications count' });
  }
};

// Update application status (approve/reject)
export const updateApplicationStatus = async (
  req: Request<{ id: string }, {}, { status: string }>,
  res: Response
) => {
  const { id: applicationId } = req.params;
  const { status } = req.body;
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  // Validar status permitido
  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ 
      error: 'Status inválido. Apenas "approved" ou "rejected" são permitidos.' 
    });
  }

  try {
    // Buscar aplicação com dados da demanda
    const { data: application, error: appError } = await supabaseAdmin
      .from('demand_applications')
      .select(`
        *,
        demands!inner(
          id,
          title,
          clinic_id,
          vacancies,
          filled_positions
        ),
        vets (
          id,
          name,
          email
        ),
        freelancers (
          id,
          name,
          email
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Aplicação não encontrada' });
    }

    const demand = (application as any).demands;
    if (!demand) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Validar permissões: apenas clínica dona da demanda pode aprovar/rejeitar
    const hasAccess = await checkClinicAccess(user.id, demand.clinic_id);
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'Você não tem permissão para aprovar/rejeitar aplicações desta demanda' 
      });
    }

    // Validar transição de status
    const currentStatus = application.status;
    const validTransitions: Record<string, string[]> = {
      'applied': ['approved', 'rejected'],
      'invited': ['approved', 'rejected'],
    };

    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({ 
        error: `Não é possível transicionar de "${currentStatus}" para "${status}"` 
      });
    }

    // Se está aprovando, verificar se há vagas disponíveis
    if (status === 'approved') {
      if (demand.filled_positions >= demand.vacancies) {
        return res.status(400).json({ 
          error: 'Não há vagas disponíveis para esta demanda' 
        });
      }
    }

    // Preparar atualização
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Atualizar timestamps conforme status
    if (status === 'approved') {
      updateData.approved_at = new Date().toISOString();
      // Se estava rejeitado, limpar rejected_at
      if (currentStatus === 'rejected') {
        updateData.rejected_at = null;
      }
    } else if (status === 'rejected') {
      updateData.rejected_at = new Date().toISOString();
      // Se estava aprovado, limpar approved_at
      if (currentStatus === 'approved') {
        updateData.approved_at = null;
      }
    }

    // Atualizar aplicação
    const { data: updatedApplication, error: updateError } = await supabaseAdmin
      .from('demand_applications')
      .update(updateData)
      .eq('id', applicationId)
      .select(`
        *,
        demands!inner(
          id,
          title,
          clinic_id,
          vacancies,
          filled_positions
        )
      `)
      .single();

    if (updateError) throw updateError;

    // Atualizar filled_positions na demanda
    const wasApproved = currentStatus === 'approved';
    const isApproving = status === 'approved';
    const isRejecting = status === 'rejected' && wasApproved;

    if (isApproving && !wasApproved) {
      // Incrementar filled_positions
      const { error: incrementError } = await supabaseAdmin
        .from('demands')
        .update({
          filled_positions: demand.filled_positions + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', demand.id);

      if (incrementError) {
        logger.error('Erro ao incrementar filled_positions', {
          demandId: demand.id,
          error: incrementError.message,
        });
        // Não falhar a operação, apenas logar
      }
    } else if (isRejecting) {
      // Decrementar filled_positions
      const { error: decrementError } = await supabaseAdmin
        .from('demands')
        .update({
          filled_positions: Math.max(0, demand.filled_positions - 1),
          updated_at: new Date().toISOString(),
        })
        .eq('id', demand.id);

      if (decrementError) {
        logger.error('Erro ao decrementar filled_positions', {
          demandId: demand.id,
          error: decrementError.message,
        });
        // Não falhar a operação, apenas logar
      }
    }

    // Recalcular status da demanda
    try {
      const newDemandStatus = await DemandLifecycleService.calculateDemandStatus(demand.id);
      await DemandLifecycleService.updateDemandStatus(demand.id, newDemandStatus);
    } catch (statusError: any) {
      logger.error('Erro ao recalcular status da demanda', {
        demandId: demand.id,
        error: statusError.message,
      });
      // Não falhar a operação, apenas logar
    }

    // Criar notificação para o vet/freelancer
    const applicant = (application as any).vets || (application as any).freelancers;
    if (applicant) {
      const notificationType = status === 'approved' ? 'application_approved' : 'application_rejected';
      const notificationMessage = status === 'approved'
        ? `Sua candidatura foi aprovada para a demanda "${demand.title}"`
        : `Sua candidatura foi rejeitada para a demanda "${demand.title}"`;

      await createNotification({
        user_id: applicant.id,
        type: notificationType,
        title: status === 'approved' ? 'Candidatura Aprovada' : 'Candidatura Rejeitada',
        message: notificationMessage,
        link: `/demands/${demand.id}`,
        entity_type: 'application',
        entity_id: applicationId,
      });
    }

    logger.info('Status da aplicação atualizado', {
      applicationId,
      oldStatus: currentStatus,
      newStatus: status,
      demandId: demand.id,
      correlationId: (req as any).correlationId,
    });

    res.json({ application: updatedApplication });
  } catch (error: any) {
    logger.error('Erro ao atualizar status da aplicação', {
      applicationId,
      status,
      error: error.message,
      correlationId: (req as any).correlationId,
    });
    res.status(500).json({ error: error.message || 'Erro ao atualizar status da aplicação' });
  }
};

// Check conflicts for an application
export const checkConflicts = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id: applicationId } = req.params;

  try {
    const conflicts = await DemandLifecycleService.checkTimeConflict(applicationId);

    logger.info('Conflitos verificados', {
      applicationId,
      conflictsCount: conflicts.length,
      correlationId: (req as any).correlationId,
    });

    res.json({ conflicts });
  } catch (error: any) {
    logger.error('Erro ao verificar conflitos', {
      applicationId,
      error: error.message,
      correlationId: (req as any).correlationId,
    });
    res.status(500).json({ error: error.message || 'Erro ao verificar conflitos' });
  }
};

// Validate conflict before applying
export const validateConflict = async (
  req: Request<{}, {}, { demand_id: string; vet_id: string }>,
  res: Response
) => {
  const { demand_id, vet_id } = req.body;

  try {
    // Buscar dados da demanda
    const { data: demand, error: demandError } = await supabaseAdmin
      .from('demands')
      .select('id, demand_date, start_time, end_time')
      .eq('id', demand_id)
      .single();

    if (demandError || !demand) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    if (!demand.demand_date || !demand.start_time) {
      return res.json({ hasConflict: false, conflicts: [] });
    }

    // Verificar conflitos usando função SQL
    const { data: conflicts, error: conflictError } = await supabaseAdmin
      .rpc('check_time_conflict_demand_applications', {
        p_vet_id: vet_id,
        p_demand_date: demand.demand_date,
        p_start_time: demand.start_time,
        p_end_time: demand.end_time || demand.start_time,
        p_exclude_application_id: null,
      });

    if (conflictError) {
      logger.error('Erro ao validar conflito', {
        demandId: demand_id,
        vetId: vet_id,
        error: conflictError.message,
      });
      return res.status(500).json({ error: 'Erro ao validar conflito' });
    }

    const hasConflict = conflicts && conflicts.length > 0;

    logger.info('Conflito validado', {
      demandId: demand_id,
      vetId: vet_id,
      hasConflict,
      conflictsCount: conflicts?.length || 0,
      correlationId: (req as any).correlationId,
    });

    res.json({
      hasConflict,
      conflicts: conflicts || [],
    });
  } catch (error: any) {
    logger.error('Erro ao validar conflito', {
      demandId: demand_id,
      vetId: vet_id,
      error: error.message,
      correlationId: (req as any).correlationId,
    });
    res.status(500).json({ error: error.message || 'Erro ao validar conflito' });
  }
};
