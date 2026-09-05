import type { HubItemKind } from '../../api/hubInventoryApi';

export type EstoqueKindFilter = 'all' | HubItemKind;
export type EstoqueStockFilter = 'all' | 'low' | 'zero' | 'ok';
export type EstoqueDirectionFilter = 'all' | 'in' | 'out';
export type EstoqueAlertasView = 'operacional' | 'validade';

export function kindLabel(k: string | null | undefined): string {
  if (k === 'medication') return 'Medicamento';
  if (k === 'vaccine') return 'Vacina';
  return 'Produto';
}

const PRODUCT_GROUP_SUGGESTIONS: Record<HubItemKind, readonly string[]> = {
  product: [
    'Alimentação',
    'Petiscos',
    'Suplementos',
    'Higiene e banho',
    'Acessórios',
    'Antiparasitários',
    'Material hospitalar',
  ],
  medication: [
    'Antibióticos',
    'Anti-inflamatórios',
    'Analgésicos',
    'Antiparasitários',
    'Dermatológicos',
    'Oftálmicos e otológicos',
    'Gastrointestinais',
    'Fluidoterapia',
  ],
  vaccine: ['Vacinas caninas', 'Vacinas felinas', 'Vacinas múltiplas', 'Reforço anual'],
};

export function suggestedProductGroups(kind: string | null | undefined): readonly string[] {
  if (kind === 'medication' || kind === 'vaccine' || kind === 'product') {
    return PRODUCT_GROUP_SUGGESTIONS[kind];
  }
  return [...PRODUCT_GROUP_SUGGESTIONS.product, ...PRODUCT_GROUP_SUGGESTIONS.medication, ...PRODUCT_GROUP_SUGGESTIONS.vaccine];
}

export function kindLabelPlural(k: EstoqueKindFilter): string {
  if (k === 'medication') return 'Medicamentos';
  if (k === 'vaccine') return 'Vacinas';
  if (k === 'product') return 'Produtos';
  return 'Itens';
}

/** Artigo + substantivo na criação: Novo produto / Novo medicamento / Nova vacina. */
export function kindNewLabel(k: string | null | undefined): string {
  if (k === 'vaccine') return 'Nova vacina';
  if (k === 'medication') return 'Novo medicamento';
  if (k === 'all' || !k) return 'Novo item';
  return 'Novo produto';
}

export function kindNoneCadastradoLabel(k: string | null | undefined): string {
  if (k === 'vaccine') return 'Nenhuma vacina cadastrada';
  if (k === 'medication') return 'Nenhum medicamento cadastrado';
  if (k === 'all' || !k) return 'Nenhum item cadastrado';
  return 'Nenhum produto cadastrado';
}

export function kindFirstCreateLabel(k: string | null | undefined): string {
  if (k === 'vaccine') return 'Criar primeira vacina';
  if (k === 'medication') return 'Criar primeiro medicamento';
  if (k === 'all' || !k) return 'Criar primeiro item';
  return 'Criar primeiro produto';
}

export function parseKindFilter(raw: string | null): EstoqueKindFilter {
  if (raw === 'product' || raw === 'medication' || raw === 'vaccine') return raw;
  return 'all';
}

export function parseStockFilter(raw: string | null): EstoqueStockFilter {
  if (raw === 'low' || raw === 'zero' || raw === 'ok') return raw;
  return 'all';
}

export function parseDirectionFilter(raw: string | null): EstoqueDirectionFilter {
  if (raw === 'in' || raw === 'out') return raw;
  return 'all';
}

export function parseAlertasView(raw: string | null): EstoqueAlertasView {
  return raw === 'validade' ? 'validade' : 'operacional';
}

export function isLowStock(qtyOnHand: number | undefined, minStockQty: number | undefined): boolean {
  const min = Number(minStockQty || 0);
  return min > 0 && (qtyOnHand ?? 0) < min;
}

export function movementDirection(movementType: string): 'in' | 'out' | 'unknown' {
  if (movementType.endsWith('_in') || movementType === 'initial_in') return 'in';
  if (movementType.endsWith('_out')) return 'out';
  return 'unknown';
}

export function partnerDisplayLabel(name: string, partyName?: string | null): string {
  const party = (partyName ?? '').trim();
  const label = name.trim();
  if (party && party.toLowerCase() !== label.toLowerCase()) return `${label} · ${party}`;
  return label;
}

export function stockItemCatalogHref(itemKind?: string | null, name?: string | null): string {
  const params = new URLSearchParams();
  if (itemKind === 'product' || itemKind === 'medication' || itemKind === 'vaccine') {
    params.set('kind', itemKind);
  }
  if (name?.trim()) params.set('q', name.trim());
  const qs = params.toString();
  return `/hub/estoque/itens${qs ? `?${qs}` : ''}`;
}
