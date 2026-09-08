/** Resolução de diárias de internação para a comanda do atendimento. */

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type HospitalizationDailyInput = {
  id: string;
  pet_id?: string | null;
  status: string;
  admitted_at: string;
  discharged_at?: string | null;
  daily_hub_service_type_id?: string | null;
  daily_unit_amount?: number | null;
  service_name?: string | null;
};

/**
 * Número de diárias entre admissão e alta (ou agora, se ativa).
 * Conta o dia de admissão; mínimo 1 enquanto internado ou após alta no mesmo dia.
 */
export function computeHospitalizationDays(
  admittedAt: string | null | undefined,
  dischargedAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!admittedAt) return 0;
  const start = new Date(admittedAt);
  if (Number.isNaN(start.getTime())) return 0;

  const endRaw = dischargedAt ? new Date(dischargedAt) : now;
  if (Number.isNaN(endRaw.getTime())) return 0;

  // Normaliza para meia-noite local do calendário (diferença em dias civis).
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(endRaw.getFullYear(), endRaw.getMonth(), endRaw.getDate());
  const days = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
}

export type HospitalizationDailyComandaLine = {
  pet_id: string | null;
  item_kind: 'service';
  hub_service_type_id: string | null;
  hub_inventory_item_id: null;
  hub_inventory_lot_id: null;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  service_date: string | null;
  origin_type: 'hospitalization_daily';
  origin_id: string;
  sort_order: number;
};

export function buildHospitalizationDailyDescription(
  serviceName: string | null | undefined,
  quantity: number,
): string {
  const name = (serviceName ?? 'Diária de internação').trim() || 'Diária de internação';
  return `${name} — ${quantity} ${quantity === 1 ? 'diária' : 'diárias'}`;
}

/**
 * Monta a linha de diária para a comanda.
 * Retorna null se não houver serviço de diária configurado ou valor inválido.
 * Itens `included` / cobranças extras ficam em hub_hospitalization_charges (outra origem).
 */
export function buildHospitalizationDailyItems(
  hospitalization: HospitalizationDailyInput,
  now: Date = new Date(),
): { line: HospitalizationDailyComandaLine; subtotal: number } | null {
  if (!hospitalization.daily_hub_service_type_id) return null;
  if (hospitalization.status === 'cancelled') return null;

  const unitAmount = round2(Number(hospitalization.daily_unit_amount ?? 0));
  if (unitAmount < 0) return null;

  const quantity = computeHospitalizationDays(
    hospitalization.admitted_at,
    hospitalization.discharged_at,
    now,
  );
  const lineTotal = round2(quantity * unitAmount);

  const line: HospitalizationDailyComandaLine = {
    pet_id: hospitalization.pet_id ?? null,
    item_kind: 'service',
    hub_service_type_id: hospitalization.daily_hub_service_type_id,
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    description: buildHospitalizationDailyDescription(hospitalization.service_name, quantity),
    quantity,
    unit_amount: unitAmount,
    discount_amount: 0,
    line_total: lineTotal,
    service_date: hospitalization.admitted_at
      ? hospitalization.admitted_at.slice(0, 10)
      : null,
    origin_type: 'hospitalization_daily',
    origin_id: hospitalization.id,
    sort_order: 0,
  };

  return { line, subtotal: lineTotal };
}
