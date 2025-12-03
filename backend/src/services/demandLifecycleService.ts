import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Serviço para gerenciar o lifecycle de demandas e aplicações
 */
export class DemandLifecycleService {
  /**
   * Atualizar status da demanda
   * @param demandId ID da demanda
   * @param newStatus Novo status
   */
  static async updateDemandStatus(demandId: string, newStatus: string) {
    try {
      const { error } = await supabaseAdmin
        .from('demands')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', demandId);

      if (error) throw error;

      logger.info('Status da demanda atualizado', {
        demandId,
        newStatus,
      });
    } catch (error: any) {
      logger.error('Erro ao atualizar status da demanda', {
        demandId,
        newStatus,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validar transição de status
   * @param currentStatus Status atual
   * @param newStatus Novo status
   * @throws Error se transição inválida
   */
  static validateStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: Record<string, string[]> = {
      'invited': ['applied', 'approved', 'rejected', 'rejected_by_vet'],
      'applied': ['approved', 'rejected'],
      'approved': ['rejected', 'check_in', 'rejected_by_vet'],
      'rejected': [], // Não pode transicionar de rejected
      'check_in': ['check_out', 'rejected_by_vet'],
      'check_out': ['report_sent', 'rejected_by_vet'],
      'report_sent': ['report_approved', 'rejected_by_vet'],
      'report_approved': [], // Status final
      'rejected_by_vet': [], // Status final
      'canceled_by_vet': [], // Status final
    };

    const allowedStatuses = validTransitions[currentStatus] || [];
    
    if (!allowedStatuses.includes(newStatus)) {
      throw new Error(
        `Transição inválida: não é possível mudar de "${currentStatus}" para "${newStatus}". ` +
        `Transições permitidas: ${allowedStatuses.join(', ') || 'nenhuma'}`
      );
    }
  }

  /**
   * Atualizar status da aplicação
   * @param applicationId ID da aplicação
   * @param newStatus Novo status
   */
  static async updateApplicationStatus(applicationId: string, newStatus: string) {
    try {
      // Buscar status atual
      const { data: application, error: fetchError } = await supabaseAdmin
        .from('demand_applications')
        .select('status')
        .eq('id', applicationId)
        .single();

      if (fetchError || !application) {
        throw new Error('Aplicação não encontrada');
      }

      // Validar transição
      this.validateStatusTransition(application.status, newStatus);

      const { error } = await supabaseAdmin
        .from('demand_applications')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (error) throw error;

      logger.info('Status da aplicação atualizado', {
        applicationId,
        oldStatus: application.status,
        newStatus,
      });
    } catch (error: any) {
      logger.error('Erro ao atualizar status da aplicação', {
        applicationId,
        newStatus,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calcular status da demanda baseado nas aplicações
   * @param demandId ID da demanda
   * @returns Status calculado
   */
  static async calculateDemandStatus(demandId: string): Promise<string> {
    try {
      // Buscar demanda
      const { data: demand, error: demandError } = await supabaseAdmin
        .from('demands')
        .select('id, vacancies, filled_positions, status')
        .eq('id', demandId)
        .single();

      if (demandError || !demand) {
        throw new Error('Demanda não encontrada');
      }

      // Buscar aplicações
      const { data: applications, error: appsError } = await supabaseAdmin
        .from('demand_applications')
        .select('status')
        .eq('demand_id', demandId);

      if (appsError) throw appsError;

      const apps = applications || [];

      // Contar aplicações por status
      const hasApplicants = apps.some((app) => ['applied', 'invited'].includes(app.status));
      const approvedCount = apps.filter((app) => ['approved', 'check_in', 'check_out', 'report_sent', 'report_approved'].includes(app.status)).length;
      const checkInCount = apps.filter((app) => ['check_in', 'check_out', 'report_sent', 'report_approved'].includes(app.status)).length;
      const reportSentCount = apps.filter((app) => ['report_sent', 'report_approved'].includes(app.status)).length;
      const reportApprovedCount = apps.filter((app) => app.status === 'report_approved').length;

      // Calcular status baseado nas regras
      if (reportApprovedCount > 0 && reportApprovedCount === approvedCount) {
        return 'completed';
      }

      if (reportSentCount > 0 && reportSentCount === approvedCount) {
        return 'awaiting_report';
      }

      if (checkInCount > 0) {
        return 'in_progress';
      }

      if (approvedCount >= demand.vacancies) {
        return 'filled';
      }

      if (approvedCount > 0 && approvedCount < demand.vacancies) {
        return 'partially_filled';
      }

      if (hasApplicants) {
        return 'with_applicants';
      }

      return 'open';
    } catch (error: any) {
      logger.error('Erro ao calcular status da demanda', {
        demandId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Transicionar demanda para 'in_progress' se pelo menos 1 vet fez check-in
   * @param demandId ID da demanda
   */
  static async transitionToInProgress(demandId: string) {
    try {
      // Verificar se já está em 'in_progress' ou status posterior
      const { data: demand } = await supabaseAdmin
        .from('demands')
        .select('status')
        .eq('id', demandId)
        .single();

      if (demand && ['in_progress', 'awaiting_report', 'completed'].includes(demand.status)) {
        return; // Já está em status posterior
      }

      // Verificar se pelo menos 1 aplicação tem check_in
      const { data: applications, error } = await supabaseAdmin
        .from('demand_applications')
        .select('status')
        .eq('demand_id', demandId)
        .in('status', ['check_in', 'check_out', 'report_sent', 'report_approved']);

      if (error) throw error;

      if (applications && applications.length > 0) {
        await this.updateDemandStatus(demandId, 'in_progress');
      }
    } catch (error: any) {
      logger.error('Erro ao transicionar para in_progress', {
        demandId,
        error: error.message,
      });
      // Não falhar a operação principal
    }
  }

  /**
   * Transicionar demanda para 'awaiting_report' se todos os aprovados fizeram check-out
   * @param demandId ID da demanda
   */
  static async transitionToAwaitingReport(demandId: string) {
    try {
      // Buscar demanda
      const { data: demand } = await supabaseAdmin
        .from('demands')
        .select('id, status')
        .eq('id', demandId)
        .single();

      if (!demand) return;

      // Se já está em 'awaiting_report' ou 'completed', não fazer nada
      if (['awaiting_report', 'completed'].includes(demand.status)) {
        return;
      }

      // Buscar aplicações aprovadas
      const { data: approvedApps } = await supabaseAdmin
        .from('demand_applications')
        .select('status')
        .eq('demand_id', demandId)
        .in('status', ['approved', 'check_in', 'check_out', 'report_sent', 'report_approved']);

      if (!approvedApps || approvedApps.length === 0) {
        return;
      }

      // Verificar se todos os aprovados fizeram check-out (status check_out, report_sent ou report_approved)
      const allCheckedOut = approvedApps.every((app) =>
        ['check_out', 'report_sent', 'report_approved'].includes(app.status)
      );

      if (allCheckedOut) {
        await this.updateDemandStatus(demandId, 'awaiting_report');
      }
    } catch (error: any) {
      logger.error('Erro ao transicionar para awaiting_report', {
        demandId,
        error: error.message,
      });
      // Não falhar a operação principal
    }
  }

  /**
   * Verificar conflitos de horário para uma aplicação
   * @param applicationId ID da aplicação
   * @returns Lista de conflitos
   */
  static async checkTimeConflict(applicationId: string) {
    try {
      // Buscar dados da aplicação e demanda
      const { data: application, error: appError } = await supabaseAdmin
        .from('demand_applications')
        .select(`
          id,
          vet_id,
          demand_id,
          demands!inner(
            id,
            demand_date,
            start_time,
            end_time
          )
        `)
        .eq('id', applicationId)
        .single();

      if (appError || !application) {
        throw new Error('Aplicação não encontrada');
      }

      const demand = (application as any).demands;
      if (!demand || !demand.demand_date || !demand.start_time) {
        return [];
      }

      // Chamar função SQL para verificar conflitos
      const { data: conflicts, error: conflictError } = await supabaseAdmin
        .rpc('check_time_conflict_demand_applications', {
          p_vet_id: application.vet_id,
          p_demand_date: demand.demand_date,
          p_start_time: demand.start_time,
          p_end_time: demand.end_time || demand.start_time,
          p_exclude_application_id: applicationId,
        });

      if (conflictError) {
        logger.error('Erro ao verificar conflitos', {
          applicationId,
          error: conflictError.message,
        });
        return [];
      }

      return conflicts || [];
    } catch (error: any) {
      logger.error('Erro ao verificar conflitos de horário', {
        applicationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Transicionar demanda para 'completed' se todos os relatórios foram aprovados
   * @param demandId ID da demanda
   */
  static async transitionToCompleted(demandId: string) {
    try {
      // Buscar aplicações aprovadas
      const { data: approvedApps } = await supabaseAdmin
        .from('demand_applications')
        .select('status')
        .eq('demand_id', demandId)
        .in('status', ['approved', 'check_in', 'check_out', 'report_sent', 'report_approved']);

      if (!approvedApps || approvedApps.length === 0) {
        return;
      }

      // Verificar se todos os aprovados têm relatório aprovado
      const allReportsApproved = approvedApps.every((app) => app.status === 'report_approved');

      if (allReportsApproved) {
        await this.updateDemandStatus(demandId, 'completed');
      }
    } catch (error: any) {
      logger.error('Erro ao transicionar para completed', {
        demandId,
        error: error.message,
      });
      // Não falhar a operação principal
    }
  }
}

