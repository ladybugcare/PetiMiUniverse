/** Montagem de linhas do day board a partir de comandas manuais (venda rápida). */

export type ManualDayBoardComanda = {
  id: string;
  origin_id: string;
  status: string;
  opened_at: string | null;
  total_amount: number | null;
  finance_handoff_at: string | null;
  guardian_id: string | null;
  pet_id: string | null;
  guardian: { id: string; full_name: string } | null;
  pet: { id: string; name: string } | null;
};

export type ManualDayBoardLine = {
  comanda_id: string;
  description: string | null;
  line_total: number | null;
  quantity: number | null;
  item_kind: string | null;
  pet_id: string | null;
  status: string | null;
};

export type ManualDayBoardService = {
  name: string;
  amount: number;
  kind?: 'service' | 'product' | 'fee' | null;
};

export type ManualDayBoardBuilt = {
  origin_type: 'manual';
  origin_id: string;
  origin_label: string;
  service_group: null;
  starts_at: string | null;
  guardian_id: string | null;
  guardian: { id: string; full_name: string } | null;
  pet_id: string | null;
  pet: { id: string; name: string } | null;
  operational_status: string;
  estimated_amount: number;
  services: ManualDayBoardService[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineLabel(line: ManualDayBoardLine): string {
  const raw = String(line.description ?? '').trim() || 'Item';
  const qty = Number(line.quantity ?? 1);
  const kind = String(line.item_kind ?? '');
  const prefix = kind === 'product' ? '' : '';
  if (qty > 1.009) return `${prefix}${raw} ×${qty}`;
  return `${prefix}${raw}`;
}

function normalizeLineKind(raw: string | null | undefined): ManualDayBoardService['kind'] {
  const k = String(raw ?? '').trim();
  if (k === 'product') return 'product';
  if (k === 'fee') return 'fee';
  if (k === 'service') return 'service';
  if (k === 'manual') return 'service';
  return null;
}

/** Agrupa linhas de comanda (serviços + produtos) para a coluna de serviços do day board. */
export function buildManualDayBoardServices(lines: ManualDayBoardLine[]): ManualDayBoardService[] {
  const open = lines.filter((l) => String(l.status ?? 'open') !== 'cancelled');
  return open.map((l) => ({
    name: lineLabel(l),
    amount: round2(Number(l.line_total ?? 0)),
    kind: normalizeLineKind(l.item_kind),
  }));
}

export function buildManualDayBoardItem(
  comanda: ManualDayBoardComanda,
  lines: ManualDayBoardLine[],
): ManualDayBoardBuilt {
  const services = buildManualDayBoardServices(lines);
  const fromLines = round2(services.reduce((s, sv) => s + sv.amount, 0));
  const estimated =
    fromLines > 0.009 ? fromLines : round2(Number(comanda.total_amount ?? 0));

  let petId = comanda.pet_id;
  let pet = comanda.pet;
  if (!petId) {
    const withPet = lines.find((l) => l.pet_id);
    if (withPet?.pet_id) petId = withPet.pet_id;
  }

  return {
    origin_type: 'manual',
    origin_id: comanda.origin_id,
    origin_label: 'Venda rápida',
    service_group: null,
    starts_at: comanda.opened_at,
    guardian_id: comanda.guardian_id,
    guardian: comanda.guardian,
    pet_id: petId,
    pet,
    operational_status: String(comanda.status || 'open'),
    estimated_amount: estimated,
    services,
  };
}

/** Enriquecimento de stub manual a partir de linhas de recebível (sem comanda). */
export function buildManualServicesFromReceivableLines(
  lines: Array<{ description: string | null; line_total: number | null; quantity: number | null; line_kind: string | null }>,
): ManualDayBoardService[] {
  return lines.map((l) => {
    const raw = String(l.description ?? '').trim() || 'Item';
    const qty = Number(l.quantity ?? 1);
    const name = qty > 1.009 ? `${raw} ×${qty}` : raw;
    return {
      name,
      amount: round2(Number(l.line_total ?? 0)),
      kind: normalizeLineKind(l.line_kind),
    };
  });
}
