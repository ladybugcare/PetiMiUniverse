import type { HubComandaEditScopes } from '../../api/hubComandaApi';
import type { HubFinanceReceivable } from '../../api/hubFinancialApi';
import { canCaixaEditOpenComanda } from './hubComandaEditUtils';
import { receivableDrillHref } from './hubRelatoriosLinks';

/** Labels curtos de origem da comanda (lista / resumo). */
export const COMANDA_ORIGIN_LABELS: Record<string, string> = {
  appointment: 'Agenda',
  grooming_session: 'Banho e Tosa',
  encounter: 'Clínica',
  quote: 'Orçamento',
  boarding_reservation: 'Hotel/Creche',
  package: 'Pacote',
  manual: 'Manual',
};

/** Mesmos rótulos para `source_type` de recebível (quando não há linhas). */
export const RECEIVABLE_SOURCE_LABELS: Record<string, string> = {
  ...COMANDA_ORIGIN_LABELS,
  appointment: 'Agenda',
};

export type ComandaListPreview = {
  id?: unknown;
  origin_type?: unknown;
  pet?: { name?: string } | null;
  pet_id?: unknown;
  pets?: Array<{ id?: string; name?: string }> | null;
  item_labels?: unknown;
  items_count?: unknown;
  opened_at?: unknown;
  finance_handoff_at?: unknown;
  edit_scopes?: HubComandaEditScopes | null;
};

/** Título da linha: serviços quando houver; senão «Sem itens». */
export function formatComandaListTitle(comanda: ComandaListPreview): string {
  const labels = Array.isArray(comanda.item_labels)
    ? (comanda.item_labels as unknown[]).map((l) => String(l ?? '').trim()).filter(Boolean)
    : [];
  return formatItemLabelsTitle(labels) || 'Sem itens';
}

/** Pets da comanda (itens + contexto), ou «Tutor». */
export function formatComandaListPets(
  comanda: ComandaListPreview,
  fallbackPets?: Array<{ id: string; name: string }>,
): string {
  const fromApi = Array.isArray(comanda.pets)
    ? comanda.pets.map((p) => String(p?.name ?? '').trim()).filter(Boolean)
    : [];
  if (fromApi.length) return fromApi.join(', ');

  const headerName = comanda.pet?.name?.trim();
  if (headerName) return headerName;

  if (typeof comanda.pet_id === 'string' && fallbackPets?.length) {
    const found = fallbackPets.find((p) => p.id === comanda.pet_id);
    if (found?.name) return found.name;
  }

  return 'Tutor';
}

export function formatComandaListOpenedAt(comanda: ComandaListPreview): string | null {
  if (!comanda.opened_at) return null;
  const d = new Date(String(comanda.opened_at));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
}

export function formatComandaOriginLabel(originType: unknown): string {
  const origin = String(originType ?? '');
  return COMANDA_ORIGIN_LABELS[origin] ?? (origin || 'Comanda');
}

function formatItemLabelsTitle(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
  if (labels.length > 2) return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
  return '';
}

/**
 * Título do recebível como no caixa: nomes dos serviços/produtos das linhas.
 * Se as linhas vierem vazias, usa `item_labels` da comanda vinculada (mesmo padrão da lista de cima).
 * Só cai na origem (Manual / Agenda / …) se não houver nenhum dos dois.
 */
export function formatReceivableListTitle(
  receivable: Pick<HubFinanceReceivable, 'source_type' | 'lines' | 'comanda_id'>,
  linkedComanda?: ComandaListPreview | null,
): string {
  const labels = (receivable.lines ?? [])
    .map((ln) => {
      const fromService = ln.service_type?.name?.trim();
      if (fromService) return fromService;
      const fromProduct = ln.inventory_item?.name?.trim();
      if (fromProduct) return fromProduct;
      return String(ln.description ?? '').trim();
    })
    .filter(Boolean);
  const fromLines = formatItemLabelsTitle(labels);
  if (fromLines) return fromLines;

  if (linkedComanda) {
    const fromComanda = formatComandaListTitle(linkedComanda);
    if (fromComanda && fromComanda !== 'Sem itens') return fromComanda;
  }

  return RECEIVABLE_SOURCE_LABELS[receivable.source_type] ?? formatComandaOriginLabel(receivable.source_type);
}

/** Preferir Financeiro quando já houve handoff (ou caixa bloqueado) e o usuário pode ler financeiro. */
export function resolveComandaProfileHref(
  comanda: Record<string, unknown>,
  opts: { canFinancialRead: boolean },
): string {
  const id = String(comanda.id ?? '');
  if (!id) return '/hub/caixa';

  const handoff = Boolean(comanda.finance_handoff_at);
  const scopes = comanda.edit_scopes as HubComandaEditScopes | undefined;
  const caixaBlocked = scopes ? !scopes.caixa : handoff;
  const preferFinanceiro = opts.canFinancialRead && (handoff || caixaBlocked);

  if (preferFinanceiro) return `/hub/financeiro/comanda/${id}`;
  return `/hub/caixa/comanda/${id}`;
}

export function resolveReceivableProfileHref(
  receivable: Pick<HubFinanceReceivable, 'id' | 'comanda_id'>,
  opts: { canFinancialRead: boolean },
): string | null {
  if (!opts.canFinancialRead) return null;
  if (receivable.comanda_id) {
    return `/hub/financeiro/comanda/${receivable.comanda_id}?receivable_id=${encodeURIComponent(receivable.id)}`;
  }
  return receivableDrillHref(receivable.id);
}

export function isReceivablePayable(status: string | undefined | null): boolean {
  return status === 'pending' || status === 'partially_paid';
}

/** Ação do botão Cobrar na lista: checkout no caixa, drawer de recebível, ou ir ao financeiro. */
export type ComandaProfileChargeAction =
  | { kind: 'checkout_drawer'; comandaId: string }
  | { kind: 'receivable_drawer'; comandaId: string; receivableId: string }
  | { kind: 'navigate'; href: string }
  | { kind: 'none' };

export function resolveComandaProfileChargeAction(
  comanda: Record<string, unknown>,
  receivables: Array<Pick<HubFinanceReceivable, 'id' | 'comanda_id' | 'status'>>,
  opts: { canCreateReceivable: boolean; canFinancialRead: boolean },
): ComandaProfileChargeAction {
  const comandaId = String(comanda.id ?? '');
  if (!comandaId || !opts.canCreateReceivable) return { kind: 'none' };

  if (canCaixaEditOpenComanda(comanda)) {
    return { kind: 'checkout_drawer', comandaId };
  }

  const linked = receivables.find(
    (r) => r.comanda_id === comandaId && isReceivablePayable(r.status),
  );
  if (linked) {
    return { kind: 'receivable_drawer', comandaId, receivableId: linked.id };
  }

  if (opts.canFinancialRead) {
    return { kind: 'navigate', href: `/hub/financeiro/comanda/${comandaId}` };
  }

  return { kind: 'none' };
}
