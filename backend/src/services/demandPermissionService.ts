import { supabase } from '../config/supabase.js';
import { checkClinicAccess, checkPermission } from '../middleware/authMiddleware.js';

/**
 * Serviço de verificação de permissões para criação de demandas
 */
export class DemandPermissionService {
  /**
   * Verifica se o usuário pode criar demanda na clínica
   */
  static async canCreateDemand(
    userId: string,
    clinicId: string
  ): Promise<boolean> {
    try {
      // Verificar se usuário pertence à clínica
      const hasAccess = await checkClinicAccess(userId, clinicId);
      if (!hasAccess) {
        return false;
      }

      // Verificar se clínica está ativa
      const { data: clinic, error: clinicError } = await supabase
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
      const hasPermission = await checkPermission(userId, clinicId, 'demand.create');
      if (!hasPermission) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking demand creation permission:', error);
      return false;
    }
  }

  /**
   * Verifica se o usuário pode criar demanda na unidade
   */
  static async canCreateDemandInUnit(
    userId: string,
    unitId: string
  ): Promise<boolean> {
    try {
      // Verificar se unidade existe
      const { data: unit, error: unitError } = await supabase
        .from('units')
        .select('id, clinic_id, status')
        .eq('id', unitId)
        .single();

      if (unitError || !unit) {
        return false;
      }

      if (unit.status !== 'active') {
        return false;
      }

      // Verificar se usuário pode criar demanda na clínica
      const canCreate = await this.canCreateDemand(userId, unit.clinic_id);
      if (!canCreate) {
        return false;
      }

      // Verificar se unidade pertence à clínica (já verificado acima, mas garantir)
      return true;
    } catch (error) {
      console.error('Error checking unit demand creation permission:', error);
      return false;
    }
  }
}

