"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemandPermissionService = void 0;
const supabase_js_1 = require("../config/supabase.js");
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
/**
 * Serviço de verificação de permissões para criação de demandas
 */
class DemandPermissionService {
    /**
     * Verifica se o usuário pode criar demanda na clínica
     */
    static async canCreateDemand(userId, clinicId) {
        try {
            // Verificar se usuário pertence à clínica
            const hasAccess = await (0, authMiddleware_js_1.checkClinicAccess)(userId, clinicId);
            if (!hasAccess) {
                return false;
            }
            // Verificar se clínica está ativa
            const { data: clinic, error: clinicError } = await supabase_js_1.supabase
                .from('clinics')
                .select('status')
                .eq('id', clinicId)
                .single();
            if (clinicError || !clinic) {
                return false;
            }
            if (clinic.status !== 'active') {
                return false;
            }
            // Verificar permissão demand.create
            const hasPermission = await (0, authMiddleware_js_1.checkPermission)(userId, clinicId, 'demand.create');
            if (!hasPermission) {
                return false;
            }
            return true;
        }
        catch (error) {
            console.error('Error checking demand creation permission:', error);
            return false;
        }
    }
    /**
     * Verifica se o usuário pode criar demanda na unidade
     */
    static async canCreateDemandInUnit(userId, unitId) {
        try {
            // Verificar se unidade existe
            const { data: unit, error: unitError } = await supabase_js_1.supabase
                .from('units')
                .select('id, clinic_id, status')
                .eq('id', unitId)
                .single();
            if (unitError || !unit) {
                return false;
            }
            if (!['active', 'approved'].includes(unit.status)) {
                return false;
            }
            // Verificar se usuário pode criar demanda na clínica
            const canCreate = await this.canCreateDemand(userId, unit.clinic_id);
            if (!canCreate) {
                return false;
            }
            // Verificar se unidade pertence à clínica (já verificado acima, mas garantir)
            return true;
        }
        catch (error) {
            console.error('Error checking unit demand creation permission:', error);
            return false;
        }
    }
}
exports.DemandPermissionService = DemandPermissionService;
