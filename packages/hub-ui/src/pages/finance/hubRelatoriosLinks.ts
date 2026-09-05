/** Links de drill-down a partir dos relatórios. */

export function receivableDrillHref(receivableId: string): string {
  return `/hub/financeiro?receivable_id=${encodeURIComponent(receivableId)}`;
}

export function guardianDrillHref(guardianId: string): string {
  return `/hub/clientes/${encodeURIComponent(guardianId)}`;
}

export function appointmentDrillHref(appointmentId: string, dateYmd?: string | null): string {
  const q = new URLSearchParams({ appointment_id: appointmentId });
  if (dateYmd) q.set('date', dateYmd.slice(0, 10));
  return `/hub/appointments?${q}`;
}

export function boardingDrillHref(): string {
  return '/hub/hotel-creche';
}

export function stockItemDrillHref(itemKind: string | null | undefined, name?: string | null): string {
  const params = new URLSearchParams();
  if (itemKind === 'medication' || itemKind === 'vaccine' || itemKind === 'product') {
    params.set('kind', itemKind);
  }
  if (name?.trim()) params.set('q', name.trim());
  const qs = params.toString();
  return `/hub/estoque/itens${qs ? `?${qs}` : ''}`;
}

export function petDrillHref(petId: string): string {
  return `/hub/pets/${encodeURIComponent(petId)}`;
}

export function groomingQueueHref(): string {
  return '/hub/banho-tosa';
}

/** Caixa filtrado em atendimentos sem comanda (cobrança ainda não iniciada). */
export function caixaSemComandaHref(dateYmd?: string | null): string {
  const q = new URLSearchParams({ status: 'sem_comanda' });
  if (dateYmd) q.set('date', dateYmd.slice(0, 10));
  return `/hub/caixa?${q}`;
}
