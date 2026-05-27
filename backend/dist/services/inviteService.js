"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteService = void 0;
const supabase_js_1 = require("../config/supabase.js");
const notificationsController_js_1 = require("../controllers/notificationsController.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Serviço para gerenciar convites de clínicas para veterinários
 */
class InviteService {
    /**
     * Convidar um veterinário para uma demanda
     * @param demandId ID da demanda
     * @param vetId ID do veterinário
     * @param invitedBy ID do usuário que está convidando (clínica)
     * @returns Aplicação criada com status 'invited'
     */
    static async inviteVetToDemand(demandId, vetId, invitedBy) {
        try {
            // Verificar se demanda existe e se o usuário tem permissão
            const { data: demand, error: demandError } = await supabase_js_1.supabaseAdmin
                .from('demands')
                .select('id, clinic_id, title, status')
                .eq('id', demandId)
                .single();
            if (demandError || !demand) {
                throw new Error('Demanda não encontrada');
            }
            // Verificar se o usuário que está convidando pertence à clínica da demanda
            const { data: clinicUser } = await supabase_js_1.supabaseAdmin
                .from('clinic_users')
                .select('clinic_id')
                .eq('user_id', invitedBy)
                .eq('clinic_id', demand.clinic_id)
                .single();
            if (!clinicUser) {
                throw new Error('Você não tem permissão para convidar vets para esta demanda');
            }
            // Verificar se já existe aplicação para este vet nesta demanda
            const { data: existingApp } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .select('id, status')
                .eq('demand_id', demandId)
                .eq('vet_id', vetId)
                .maybeSingle();
            if (existingApp) {
                // Se já existe e está em outro status, atualizar para 'invited'
                if (existingApp.status !== 'invited') {
                    const { data: updated, error: updateError } = await supabase_js_1.supabaseAdmin
                        .from('demand_applications')
                        .update({
                        status: 'invited',
                        invited_by: invitedBy,
                        invited_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                        .eq('id', existingApp.id)
                        .select()
                        .single();
                    if (updateError)
                        throw updateError;
                    // Criar notificação
                    await this.createInviteNotification(demandId, vetId, demand.title);
                    return updated;
                }
                return existingApp;
            }
            // Criar nova aplicação com status 'invited'
            const { data: application, error: appError } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .insert({
                demand_id: demandId,
                vet_id: vetId,
                status: 'invited',
                invited_by: invitedBy,
                invited_at: new Date().toISOString(),
            })
                .select()
                .single();
            if (appError)
                throw appError;
            // Criar notificação
            await this.createInviteNotification(demandId, vetId, demand.title);
            // Atualizar status da demanda se necessário
            if (demand.status === 'open') {
                await supabase_js_1.supabaseAdmin
                    .from('demands')
                    .update({ status: 'with_applicants' })
                    .eq('id', demandId);
            }
            logger_js_1.logger.info('Vet convidado para demanda', {
                demandId,
                vetId,
                invitedBy,
                applicationId: application.id,
            });
            return application;
        }
        catch (error) {
            logger_js_1.logger.error('Erro ao convidar vet para demanda', {
                demandId,
                vetId,
                invitedBy,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * Aceitar um convite
     * @param applicationId ID da aplicação
     * @param vetId ID do veterinário (para validação)
     * @returns Aplicação atualizada
     */
    static async acceptInvite(applicationId, vetId) {
        try {
            // Verificar se a aplicação existe e pertence ao vet
            const { data: application, error: appError } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .select('id, vet_id, demand_id, status, demands!inner(title, clinic_id)')
                .eq('id', applicationId)
                .single();
            if (appError || !application) {
                throw new Error('Aplicação não encontrada');
            }
            if (application.vet_id !== vetId) {
                throw new Error('Você não tem permissão para aceitar este convite');
            }
            if (application.status !== 'invited') {
                throw new Error('Esta aplicação não é um convite pendente');
            }
            // Atualizar status para 'applied'
            const { data: updated, error: updateError } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .update({
                status: 'applied',
                applied_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .eq('id', applicationId)
                .select()
                .single();
            if (updateError)
                throw updateError;
            // Criar notificação para a clínica
            const demand = application.demands;
            await (0, notificationsController_js_1.createNotification)({
                user_id: demand.clinic_id,
                type: 'invite_accepted',
                title: 'Convite Aceito',
                message: `O veterinário aceitou o convite para "${demand.title}"`,
                link: `/demands/${application.demand_id}`,
                entity_type: 'application',
                entity_id: applicationId,
            });
            logger_js_1.logger.info('Convite aceito', {
                applicationId,
                vetId,
                demandId: application.demand_id,
            });
            return updated;
        }
        catch (error) {
            logger_js_1.logger.error('Erro ao aceitar convite', {
                applicationId,
                vetId,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * Recusar um convite
     * @param applicationId ID da aplicação
     * @param vetId ID do veterinário (para validação)
     * @returns Aplicação atualizada
     */
    static async rejectInvite(applicationId, vetId) {
        try {
            // Verificar se a aplicação existe e pertence ao vet
            const { data: application, error: appError } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .select('id, vet_id, demand_id, status, demands!inner(title, clinic_id)')
                .eq('id', applicationId)
                .single();
            if (appError || !application) {
                throw new Error('Aplicação não encontrada');
            }
            if (application.vet_id !== vetId) {
                throw new Error('Você não tem permissão para recusar este convite');
            }
            if (application.status !== 'invited') {
                throw new Error('Esta aplicação não é um convite pendente');
            }
            // Atualizar status para 'rejected_by_vet'
            const { data: updated, error: updateError } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .update({
                status: 'rejected_by_vet',
                rejected_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .eq('id', applicationId)
                .select()
                .single();
            if (updateError)
                throw updateError;
            // Criar notificação para a clínica
            const demand = application.demands;
            await (0, notificationsController_js_1.createNotification)({
                user_id: demand.clinic_id,
                type: 'invite_rejected',
                title: 'Convite Recusado',
                message: `O veterinário recusou o convite para "${demand.title}"`,
                link: `/demands/${application.demand_id}`,
                entity_type: 'application',
                entity_id: applicationId,
            });
            logger_js_1.logger.info('Convite recusado', {
                applicationId,
                vetId,
                demandId: application.demand_id,
            });
            return updated;
        }
        catch (error) {
            logger_js_1.logger.error('Erro ao recusar convite', {
                applicationId,
                vetId,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * Listar convites pendentes de um veterinário
     * @param vetId ID do veterinário
     * @returns Lista de aplicações com status 'invited'
     */
    static async getInvitesByVet(vetId) {
        try {
            const { data: applications, error } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .select(`
          *,
          demands (
            id,
            title,
            description,
            demand_date,
            start_time,
            end_time,
            payment,
            clinics (
              id,
              name
            )
          )
        `)
                .eq('vet_id', vetId)
                .eq('status', 'invited')
                .order('invited_at', { ascending: false });
            if (error)
                throw error;
            return applications || [];
        }
        catch (error) {
            logger_js_1.logger.error('Erro ao buscar convites do vet', {
                vetId,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * Listar convites de uma demanda
     * @param demandId ID da demanda
     * @returns Lista de aplicações com status 'invited'
     */
    static async getInvitesByDemand(demandId) {
        try {
            const { data: applications, error } = await supabase_js_1.supabaseAdmin
                .from('demand_applications')
                .select(`
          *,
          vets (
            id,
            name,
            email,
            crmv,
            specialties
          )
        `)
                .eq('demand_id', demandId)
                .eq('status', 'invited')
                .order('invited_at', { ascending: false });
            if (error)
                throw error;
            return applications || [];
        }
        catch (error) {
            logger_js_1.logger.error('Erro ao buscar convites da demanda', {
                demandId,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * Criar notificação de convite
     */
    static async createInviteNotification(demandId, vetId, demandTitle) {
        try {
            // Buscar informações da clínica
            const { data: demand } = await supabase_js_1.supabaseAdmin
                .from('demands')
                .select('clinics!inner(id, name)')
                .eq('id', demandId)
                .single();
            const clinic = demand?.clinics;
            await (0, notificationsController_js_1.createNotification)({
                user_id: vetId,
                type: 'demand_invite',
                title: 'Convite para demanda',
                message: clinic
                    ? `A clínica ${clinic.name} te convidou para a demanda "${demandTitle}"`
                    : `Você foi convidado para a demanda "${demandTitle}"`,
                link: `/demands/${demandId}`,
                entity_type: 'application',
                entity_id: demandId,
            });
        }
        catch (error) {
            logger_js_1.logger.error('Erro ao criar notificação de convite', {
                demandId,
                vetId,
                error: error.message,
            });
            // Não falhar a operação principal se a notificação falhar
        }
    }
}
exports.InviteService = InviteService;
