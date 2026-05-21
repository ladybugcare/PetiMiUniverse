import { supabaseAdmin } from '../config/supabase.js';
import { checkClinicAccess } from '../middleware/authMiddleware.js';

/**
 * Interface para posição de demanda
 */
export interface Position {
  slots: number;
  specialties: string[];
  description?: string;
}

/**
 * Serviço de validação para criação de demandas
 */
export class DemandValidationService {
  /**
   * Valida se a clínica existe, o utilizador pertence a ela e a clínica pode operar
   * (`active`, ou `pending_approval` com pelo menos uma unidade aprovada).
   */
  static async validateClinic(clinicId: string, userId: string): Promise<void> {
    // Verificar se clínica existe
    const { data: clinic, error } = await supabaseAdmin
      .from('clinics')
      .select('id, status')
      .eq('id', clinicId)
      .single();

    if (error || !clinic) {
      throw new Error('Clínica não encontrada');
    }

    let clinicOperational = clinic.status === 'active';
    if (!clinicOperational && clinic.status === 'pending_approval') {
      const { data: approvedUnits, error: unitsErr } = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('clinic_id', clinicId)
        .in('status', ['approved', 'active'])
        .limit(1);
      clinicOperational = !unitsErr && (approvedUnits?.length ?? 0) > 0;
    }

    if (!clinicOperational) {
      throw new Error('Clínica não está ativa');
    }

    // Verificar se usuário pertence à clínica
    const hasAccess = await checkClinicAccess(userId, clinicId);
    if (!hasAccess) {
      throw new Error('Usuário não pertence a esta clínica');
    }
  }

  /**
   * Valida a unidade e retorna o unit_id validado
   * Se unit_id não fornecido e clínica tem apenas uma unidade aprovada, retorna essa unidade
   * Se clínica tem múltiplas unidades e unit_id não fornecido, lança erro
   * IMPORTANTE: Só permite criar demanda em unidades aprovadas (`approved` ou `active` em BD legado)
   */
  static async validateUnit(
    unitId: string | undefined,
    clinicId: string
  ): Promise<string> {
    // Buscar unidades aprovadas da clínica
    const { data: units, error: unitsError } = await supabaseAdmin
      .from('units')
      .select('id')
      .eq('clinic_id', clinicId)
      .in('status', ['approved', 'active']);

    if (unitsError) {
      throw new Error('Erro ao buscar unidades da clínica');
    }

    const unitsCount = units?.length || 0;

    // Se unit_id não fornecido
    if (!unitId) {
      if (unitsCount === 0) {
        throw new Error('Clínica não possui unidades aprovadas');
      }
      if (unitsCount === 1) {
        // Retornar a única unidade aprovada
        return units[0].id;
      }
      // Múltiplas unidades aprovadas: unit_id é obrigatório
      throw new Error('Unidade é obrigatória quando a clínica possui múltiplas unidades aprovadas');
    }

    // Se unit_id fornecido: verificar se existe, pertence à clínica e está aprovada
    const { data: unit, error: unitError } = await supabaseAdmin
      .from('units')
      .select('id, clinic_id, status, name')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      throw new Error('Unidade não encontrada');
    }

    if (unit.clinic_id !== clinicId) {
      throw new Error('Unidade não pertence a esta clínica');
    }

    if (!['approved', 'active'].includes(unit.status)) {
      if (unit.status === 'pending_review') {
        throw new Error(`Unidade "${unit.name}" está aguardando aprovação do administrador`);
      }
      if (unit.status === 'rejected') {
        throw new Error(`Unidade "${unit.name}" foi rejeitada e não pode criar demandas`);
      }
      throw new Error(`Unidade "${unit.name}" não está aprovada. Apenas unidades aprovadas podem criar demandas`);
    }

    return unitId;
  }

  /**
   * Valida se a data não é no passado
   */
  static validateDate(demandDate: string): void {
    const date = new Date(demandDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (isNaN(date.getTime())) {
      throw new Error('Data inválida');
    }

    if (date < today) {
      throw new Error('Data não pode ser no passado');
    }
  }

  /**
   * Valida se a categoria é válida
   */
  static validateCategory(category: string): void {
    const validCategories = ['vet', 'freelancer', 'clinic', 'other'];
    if (!validCategories.includes(category)) {
      throw new Error('Categoria inválida');
    }
  }

  /**
   * Valida se as especialidades existem e pertencem à categoria correta
   */
  static async validateSpecialties(
    specialties: string[],
    category: string
  ): Promise<void> {
    if (!specialties || specialties.length === 0) {
      throw new Error('É necessário especificar pelo menos uma especialidade');
    }

    // Buscar todas as especialidades fornecidas
    const { data: foundSpecialties, error } = await supabaseAdmin
      .from('specialties')
      .select('name, role, active')
      .in('name', specialties);

    if (error) {
      throw new Error('Erro ao validar especialidades');
    }

    // Verificar se todas as especialidades foram encontradas
    const foundNames = foundSpecialties?.map((s) => s.name) || [];
    const notFound = specialties.filter((s) => !foundNames.includes(s));

    if (notFound.length > 0) {
      throw new Error(
        `Especialidades não encontradas: ${notFound.join(', ')}`
      );
    }

    // Verificar se todas estão ativas
    const inactive = foundSpecialties?.filter((s) => !s.active) || [];
    if (inactive.length > 0) {
      throw new Error(
        `Especialidades inativas: ${inactive.map((s) => s.name).join(', ')}`
      );
    }

    // Verificar se todas pertencem à categoria correta
    const wrongCategory = foundSpecialties?.filter((s) => s.role !== category) || [];
    if (wrongCategory.length > 0) {
      throw new Error(
        `Especialidades não pertencem à categoria "${category}": ${wrongCategory
          .map((s) => s.name)
          .join(', ')}`
      );
    }
  }

  /**
   * Valida as posições
   */
  static validatePositions(positions: Position[]): void {
    if (!positions || positions.length === 0) {
      throw new Error('É necessário especificar pelo menos uma posição');
    }

    positions.forEach((pos, index) => {
      if (!pos.slots || pos.slots < 1) {
        throw new Error(
          `Posição ${index + 1}: número de vagas deve ser maior que zero`
        );
      }

      if (!pos.specialties || pos.specialties.length === 0) {
        throw new Error(
          `Posição ${index + 1}: é necessário especificar pelo menos uma especialidade`
        );
      }
    });
  }

  /**
   * Valida o valor de pagamento
   */
  static validatePayment(payment: number): void {
    if (payment < 0) {
      throw new Error('Valor de pagamento não pode ser negativo');
    }
  }

  /**
   * Calcula o total de vagas a partir das posições
   */
  static calculateVacancies(positions: Position[]): number {
    return positions.reduce((total, pos) => total + (pos.slots || 0), 0);
  }

  /**
   * Valida o intervalo de horários
   */
  static validateTimeRange(
    startTime: string,
    endTime: string,
    isOvernight: boolean
  ): void {
    // Validar formato HH:MM
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime)) {
      throw new Error('Horário inicial inválido (formato esperado: HH:MM)');
    }
    if (!timeRegex.test(endTime)) {
      throw new Error('Horário final inválido (formato esperado: HH:MM)');
    }

    // Se não for demanda noturna, validar que endTime > startTime
    if (!isOvernight) {
      if (endTime <= startTime) {
        throw new Error('Horário final deve ser posterior ao horário inicial');
      }
    }
    // Se for demanda noturna, permite endTime < startTime (cruza meia-noite)
  }
}

