import { supabase, supabaseAdmin } from '../config/supabase.js';
import { createNotification } from '../controllers/notificationsController.js';
import { logger } from '../utils/logger.js';
import { DemandLifecycleService } from './demandLifecycleService.js';

/**
 * Serviço para gerenciar prova de trabalho (check-in, check-out, relatórios)
 */
export class WorkProofService {
  /**
   * Registrar check-in
   * @param applicationId ID da aplicação
   * @param location Opcional: localização do check-in
   * @returns Work proof atualizado
   */
  static async checkIn(applicationId: string, location?: { lat: number; lng: number; address?: string }) {
    try {
      // Verificar se aplicação existe e está no status correto
      const { data: application, error: appError } = await supabaseAdmin
        .from('demand_applications')
        .select('id, vet_id, demand_id, status, demands!inner(id, title, clinic_id)')
        .eq('id', applicationId)
        .single();

      if (appError || !application) {
        throw new Error('Aplicação não encontrada');
      }

      if (application.status !== 'approved') {
        throw new Error('Aplicação deve estar aprovada para fazer check-in');
      }

      // Verificar se já existe work_proof
      const { data: existingProof } = await supabaseAdmin
        .from('work_proof')
        .select('id, checkin_time')
        .eq('application_id', applicationId)
        .maybeSingle();

      let workProof;

      if (existingProof) {
        // Atualizar work_proof existente
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('work_proof')
          .update({
            checkin_time: new Date().toISOString(),
            location_checkin: location ? { lat: location.lat, lng: location.lng, address: location.address } : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingProof.id)
          .select()
          .single();

        if (updateError) throw updateError;
        workProof = updated;
      } else {
        // Criar novo work_proof
        const { data: created, error: createError } = await supabaseAdmin
          .from('work_proof')
          .insert({
            application_id: applicationId,
            checkin_time: new Date().toISOString(),
            location_checkin: location ? { lat: location.lat, lng: location.lng, address: location.address } : null,
          })
          .select()
          .single();

        if (createError) throw createError;
        workProof = created;
      }

      // Atualizar status da aplicação
      const { error: statusError } = await supabaseAdmin
        .from('demand_applications')
        .update({
          status: 'check_in',
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (statusError) throw statusError;

      // Atualizar status da demanda para 'in_progress' se necessário
      const demand = (application as any).demands;
      await DemandLifecycleService.transitionToInProgress(demand.id);
      // Recalcular status da demanda
      try {
        const newStatus = await DemandLifecycleService.calculateDemandStatus(demand.id);
        await DemandLifecycleService.updateDemandStatus(demand.id, newStatus);
      } catch (statusError: any) {
        logger.error('Erro ao recalcular status da demanda após check-in', {
          demandId: demand.id,
          error: statusError.message,
        });
      }

      // Criar notificação para a clínica
      await createNotification({
        user_id: demand.clinic_id,
        type: 'check_in',
        title: 'Check-in Realizado',
        message: `O veterinário fez check-in no plantão "${demand.title}"`,
        link: `/demands/${demand.id}`,
        entity_type: 'application',
        entity_id: applicationId,
      });

      logger.info('Check-in registrado', {
        applicationId,
        demandId: demand.id,
        location: location ? 'sim' : 'não',
      });

      return workProof;
    } catch (error: any) {
      logger.error('Erro ao registrar check-in', {
        applicationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Registrar check-out
   * @param applicationId ID da aplicação
   * @param location Opcional: localização do check-out
   * @returns Work proof atualizado
   */
  static async checkOut(applicationId: string, location?: { lat: number; lng: number; address?: string }) {
    try {
      // Verificar se aplicação existe e está no status correto
      const { data: application, error: appError } = await supabaseAdmin
        .from('demand_applications')
        .select('id, vet_id, demand_id, status, demands!inner(id, title, clinic_id)')
        .eq('id', applicationId)
        .single();

      if (appError || !application) {
        throw new Error('Aplicação não encontrada');
      }

      if (application.status !== 'check_in') {
        throw new Error('Aplicação deve ter feito check-in antes de fazer check-out');
      }

      // Buscar work_proof
      const { data: workProof, error: proofError } = await supabaseAdmin
        .from('work_proof')
        .select('id')
        .eq('application_id', applicationId)
        .single();

      if (proofError || !workProof) {
        throw new Error('Work proof não encontrado. É necessário fazer check-in primeiro.');
      }

      // Atualizar work_proof
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('work_proof')
        .update({
          checkout_time: new Date().toISOString(),
          location_checkout: location ? { lat: location.lat, lng: location.lng, address: location.address } : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workProof.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Atualizar status da aplicação
      const { error: statusError } = await supabaseAdmin
        .from('demand_applications')
        .update({
          status: 'check_out',
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (statusError) throw statusError;

      // Verificar se todos os aprovados fizeram check-out para transicionar demanda
      const demand = (application as any).demands;
      await DemandLifecycleService.transitionToAwaitingReport(demand.id);
      // Recalcular status da demanda
      try {
        const newStatus = await DemandLifecycleService.calculateDemandStatus(demand.id);
        await DemandLifecycleService.updateDemandStatus(demand.id, newStatus);
      } catch (statusError: any) {
        logger.error('Erro ao recalcular status da demanda após check-out', {
          demandId: demand.id,
          error: statusError.message,
        });
      }

      logger.info('Check-out registrado', {
        applicationId,
        demandId: demand.id,
        location: location ? 'sim' : 'não',
      });

      return updated;
    } catch (error: any) {
      logger.error('Erro ao registrar check-out', {
        applicationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Enviar relatório
   * @param applicationId ID da aplicação
   * @param reportText Texto do relatório
   * @param attachments Array de URLs de arquivos anexados
   * @returns Work proof atualizado
   */
  static async submitReport(
    applicationId: string,
    reportText: string,
    attachments?: string[]
  ) {
    try {
      // Verificar se aplicação existe e está no status correto
      const { data: application, error: appError } = await supabaseAdmin
        .from('demand_applications')
        .select('id, vet_id, demand_id, status, demands!inner(id, title, clinic_id)')
        .eq('id', applicationId)
        .single();

      if (appError || !application) {
        throw new Error('Aplicação não encontrada');
      }

      // Validar transição de status
      if (application.status !== 'check_out') {
        DemandLifecycleService.validateStatusTransition(application.status, 'report_sent');
      }

      if (!reportText || reportText.trim().length === 0) {
        throw new Error('Relatório não pode estar vazio');
      }

      // Buscar work_proof
      const { data: workProof, error: proofError } = await supabaseAdmin
        .from('work_proof')
        .select('id')
        .eq('application_id', applicationId)
        .single();

      if (proofError || !workProof) {
        throw new Error('Work proof não encontrado');
      }

      // Atualizar work_proof
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('work_proof')
        .update({
          report_text: reportText,
          attachments: attachments || [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', workProof.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Atualizar status da aplicação
      const { error: statusError } = await supabaseAdmin
        .from('demand_applications')
        .update({
          status: 'report_sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (statusError) throw statusError;

      // Atualizar status da demanda para 'awaiting_report' se necessário
      const demand = (application as any).demands;
      await DemandLifecycleService.transitionToAwaitingReport(demand.id);
      // Recalcular status da demanda
      try {
        const newStatus = await DemandLifecycleService.calculateDemandStatus(demand.id);
        await DemandLifecycleService.updateDemandStatus(demand.id, newStatus);
      } catch (statusError: any) {
        logger.error('Erro ao recalcular status da demanda após envio de relatório', {
          demandId: demand.id,
          error: statusError.message,
        });
      }

      // Criar notificação para a clínica
      await createNotification({
        user_id: demand.clinic_id,
        type: 'report_submitted',
        title: 'Relatório Enviado',
        message: `O veterinário enviou o relatório do plantão "${demand.title}"`,
        link: `/demands/${demand.id}`,
        entity_type: 'application',
        entity_id: applicationId,
      });

      logger.info('Relatório enviado', {
        applicationId,
        demandId: demand.id,
        hasAttachments: attachments && attachments.length > 0,
      });

      return updated;
    } catch (error: any) {
      logger.error('Erro ao enviar relatório', {
        applicationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Aprovar relatório
   * @param applicationId ID da aplicação
   * @param approvedBy ID do usuário que está aprovando (clínica)
   * @returns Aplicação atualizada
   */
  static async approveReport(applicationId: string, approvedBy: string) {
    try {
      // Verificar se aplicação existe e está no status correto
      const { data: application, error: appError } = await supabaseAdmin
        .from('demand_applications')
        .select('id, vet_id, demand_id, status, demands!inner(id, title, clinic_id)')
        .eq('id', applicationId)
        .single();

      if (appError || !application) {
        throw new Error('Aplicação não encontrada');
      }

      // Validar transição de status
      if (application.status !== 'report_sent') {
        DemandLifecycleService.validateStatusTransition(application.status, 'report_approved');
      }

      // Verificar se o usuário pertence à clínica da demanda
      const demand = (application as any).demands;
      const { data: clinicUser } = await supabaseAdmin
        .from('clinic_users')
        .select('clinic_id')
        .eq('user_id', approvedBy)
        .eq('clinic_id', demand.clinic_id)
        .single();

      if (!clinicUser) {
        throw new Error('Você não tem permissão para aprovar relatórios desta demanda');
      }

      // Atualizar work_proof com assinatura da clínica
      const { data: workProof } = await supabaseAdmin
        .from('work_proof')
        .select('id')
        .eq('application_id', applicationId)
        .single();

      if (workProof) {
        await supabaseAdmin
          .from('work_proof')
          .update({
            clinic_signature: {
              signed_by: approvedBy,
              signed_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', workProof.id);
      }

      // Atualizar status da aplicação
      const { data: updated, error: statusError } = await supabaseAdmin
        .from('demand_applications')
        .update({
          status: 'report_approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
        .select()
        .single();

      if (statusError) throw statusError;

      // Verificar se todos os relatórios foram aprovados para transicionar demanda
      await DemandLifecycleService.transitionToCompleted(demand.id);
      // Recalcular status da demanda
      try {
        const newStatus = await DemandLifecycleService.calculateDemandStatus(demand.id);
        await DemandLifecycleService.updateDemandStatus(demand.id, newStatus);
      } catch (statusError: any) {
        logger.error('Erro ao recalcular status da demanda após aprovação de relatório', {
          demandId: demand.id,
          error: statusError.message,
        });
      }

      // Criar notificação para o vet
      await createNotification({
        user_id: application.vet_id,
        type: 'report_approved',
        title: 'Relatório Aprovado',
        message: `Seu relatório do plantão "${demand.title}" foi aprovado`,
        link: `/my-applications`,
        entity_type: 'application',
        entity_id: applicationId,
      });

      logger.info('Relatório aprovado', {
        applicationId,
        demandId: demand.id,
        approvedBy,
      });

      return updated;
    } catch (error: any) {
      logger.error('Erro ao aprovar relatório', {
        applicationId,
        approvedBy,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obter prova de trabalho
   * @param applicationId ID da aplicação
   * @returns Work proof completo
   */
  static async getWorkProof(applicationId: string) {
    try {
      const { data: workProof, error } = await supabaseAdmin
        .from('work_proof')
        .select('*')
        .eq('application_id', applicationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Não encontrado - retornar null
          return null;
        }
        throw error;
      }

      return workProof;
    } catch (error: any) {
      logger.error('Erro ao buscar work proof', {
        applicationId,
        error: error.message,
      });
      throw error;
    }
  }
}

