/**
 * Emissores de notificação por evento operacional do Hub.
 *
 * Cada função sabe **quem** deve saber do evento (áreas operacionais) e monta o
 * texto/link; os controllers só disparam. Nenhuma delas lança: notificação nunca
 * pode quebrar o fluxo de negócio.
 */
import { supabaseAdmin } from '../../config/supabase';
import { hubNotifyStaff } from './hubNotifyStaff';

function brl(amount: number): string {
  return Number(amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function resolvePetName(petId: string | null | undefined): Promise<string> {
  if (!petId) return 'Pet';
  try {
    const { data } = await supabaseAdmin
      .from('hub_pets')
      .select('name')
      .eq('id', petId)
      .maybeSingle();
    return String(data?.name ?? '').trim() || 'Pet';
  } catch {
    return 'Pet';
  }
}

async function resolveGuardianName(guardianId: string | null | undefined): Promise<string | null> {
  if (!guardianId) return null;
  try {
    const { data } = await supabaseAdmin
      .from('hub_guardians')
      .select('full_name')
      .eq('id', guardianId)
      .maybeSingle();
    return String(data?.full_name ?? '').trim() || null;
  } catch {
    return null;
  }
}

/** Pet pronto para retirada — quem atende o tutor no balcão e no caixa. */
export async function notifyHubPetReady(opts: {
  clinicId: string;
  unitId?: string | null;
  petId?: string | null;
  sessionId: string;
  excludeUserIds?: readonly string[];
}): Promise<void> {
  const pet = await resolvePetName(opts.petId);
  await hubNotifyStaff({
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    areas: ['recepcao', 'caixa'],
    excludeUserIds: opts.excludeUserIds,
    type: 'hub_pet_ready',
    title: 'Pet pronto para retirada',
    message: `${pet} já está pronto(a) para retirada.`,
    link: '/hub/banho-tosa',
    entityType: 'grooming_session',
    entityId: opts.sessionId,
  });
}

/** Pet embarcado no leva e traz, a caminho da clínica — recepção se prepara. */
export async function notifyHubPetOnTheWay(opts: {
  clinicId: string;
  unitId?: string | null;
  petId?: string | null;
  stopId: string;
  excludeUserIds?: readonly string[];
}): Promise<void> {
  const pet = await resolvePetName(opts.petId);
  await hubNotifyStaff({
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    areas: ['recepcao'],
    excludeUserIds: opts.excludeUserIds,
    type: 'hub_pet_on_the_way',
    title: 'Pet a caminho da clínica',
    message: `${pet} embarcou no leva e traz e está a caminho.`,
    link: '/hub/leva-e-traz',
    entityType: 'pickup_stop',
    entityId: opts.stopId,
  });
}

/** Cancelamento operacional com valor já pago — caixa e financeiro resolvem. */
export async function notifyHubCancellationPending(opts: {
  clinicId: string;
  unitId?: string | null;
  comandaId: string;
  guardianId?: string | null;
  paidAmount?: number;
}): Promise<void> {
  const guardian = await resolveGuardianName(opts.guardianId);
  const valor = opts.paidAmount && opts.paidAmount > 0 ? ` (${brl(opts.paidAmount)} já pago)` : '';
  await hubNotifyStaff({
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    areas: ['caixa', 'financeiro'],
    type: 'hub_cancellation_pending',
    title: 'Cancelamento com pendência financeira',
    message: guardian
      ? `Atendimento de ${guardian} foi cancelado${valor}. Defina estorno, crédito ou cobrança.`
      : `Um atendimento foi cancelado${valor}. Defina estorno, crédito ou cobrança.`,
    link: '/hub/financeiro',
    entityType: 'comanda',
    entityId: opts.comandaId,
  });
}

/** Cobrança vencida ou saldo remanescente — caixa e financeiro acompanham. */
export async function notifyHubPaymentDue(opts: {
  clinicId: string;
  unitId?: string | null;
  receivableId: string;
  guardianId?: string | null;
  amount: number;
  dueDate?: string | null;
  reason: 'overdue' | 'partial';
}): Promise<void> {
  const guardian = await resolveGuardianName(opts.guardianId);
  const quem = guardian ? `${guardian}: ` : '';
  const venc = formatDueDate(opts.dueDate);
  const message =
    opts.reason === 'overdue'
      ? `${quem}cobrança de ${brl(opts.amount)} criada já vencida${venc ? ` em ${venc}` : ''}.`
      : `${quem}pagamento parcial recebido, restam ${brl(opts.amount)} em aberto.`;

  await hubNotifyStaff({
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    areas: ['caixa', 'financeiro'],
    type: 'hub_payment_due',
    title: opts.reason === 'overdue' ? 'Cobrança vencida' : 'Saldo em aberto após pagamento',
    message,
    link: '/hub/financeiro',
    entityType: 'receivable',
    entityId: opts.receivableId,
  });
}

/** Item abaixo do estoque mínimo — só quem cuida de estoque (e gestores). */
export async function notifyHubStockAlert(opts: {
  clinicId: string;
  itemId: string;
  itemName: string;
  qtyOnHand: number;
  minQty: number;
}): Promise<void> {
  await hubNotifyStaff({
    clinicId: opts.clinicId,
    areas: ['estoque'],
    type: 'hub_stock_alert',
    title: 'Estoque abaixo do mínimo',
    message: `${opts.itemName}: ${opts.qtyOnHand} em estoque (mínimo ${opts.minQty}).`,
    link: '/hub/estoque/alertas',
    entityType: 'inventory_item',
    entityId: opts.itemId,
  });
}

/** Lote dentro da janela de alerta de validade do item. */
export async function notifyHubStockExpiryAlert(opts: {
  clinicId: string;
  itemId: string;
  itemName: string;
  lotId: string;
  lotCode?: string | null;
  expiryDate: string;
  daysUntil: number;
}): Promise<void> {
  const lotLabel = opts.lotCode?.trim() ? `lote ${opts.lotCode}` : 'lote sem código';
  await hubNotifyStaff({
    clinicId: opts.clinicId,
    areas: ['estoque'],
    type: 'hub_stock_alert',
    title: 'Validade próxima',
    message: `${opts.itemName} (${lotLabel}): vence em ${opts.daysUntil} dia(s) (${opts.expiryDate}).`,
    link: '/hub/estoque/alertas',
    entityType: 'inventory_lot',
    entityId: opts.lotId,
  });
}

/** Check-in de hotel/creche — hotel e recepção. */
export async function notifyHubBoardingCheckin(opts: {
  clinicId: string;
  unitId?: string | null;
  petId?: string | null;
  reservationId: string;
  excludeUserIds?: readonly string[];
}): Promise<void> {
  const pet = await resolvePetName(opts.petId);
  await hubNotifyStaff({
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    areas: ['hotel_creche', 'recepcao'],
    excludeUserIds: opts.excludeUserIds,
    type: 'hub_boarding_checkin',
    title: 'Check-in realizado',
    message: `${pet} deu entrada no hotel/creche.`,
    link: '/hub/hotel-creche',
    entityType: 'boarding_reservation',
    entityId: opts.reservationId,
  });
}

/** Check-out de hotel/creche — hotel e caixa (fechar a cobrança). */
export async function notifyHubBoardingCheckout(opts: {
  clinicId: string;
  unitId?: string | null;
  petId?: string | null;
  reservationId: string;
  excludeUserIds?: readonly string[];
}): Promise<void> {
  const pet = await resolvePetName(opts.petId);
  await hubNotifyStaff({
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    areas: ['hotel_creche', 'caixa'],
    excludeUserIds: opts.excludeUserIds,
    type: 'hub_boarding_checkout',
    title: 'Check-out realizado',
    message: `${pet} saiu do hotel/creche — confira a cobrança.`,
    link: '/hub/hotel-creche',
    entityType: 'boarding_reservation',
    entityId: opts.reservationId,
  });
}
