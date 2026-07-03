import type { HubComandaEvent } from '../../api/hubComandaApi';

export type ComandaTimelineVariant = 'done' | 'active' | 'todo';

export type ComandaTimelineStep = {
  id: string;
  at: string | null;
  title: string;
  sub?: string;
  variant: ComandaTimelineVariant;
};

function fmtBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildComandaTimelineSteps(input: {
  openedAt?: string | null;
  closedAt?: string | null;
  status: string;
  paidTotal?: number;
  balanceDue?: number;
  events?: HubComandaEvent[];
}): ComandaTimelineStep[] {
  const { openedAt, closedAt, status, paidTotal = 0, balanceDue = 0, events = [] } = input;

  const timed: ComandaTimelineStep[] = [];

  if (openedAt) {
    timed.push({
      id: 'milestone-opened',
      at: openedAt,
      title: 'Comanda aberta',
      sub: new Date(openedAt).toLocaleString('pt-BR'),
      variant: 'done',
    });
  }

  for (const ev of events) {
    timed.push({
      id: ev.id,
      at: ev.created_at,
      title: ev.title,
      sub: ev.body ?? undefined,
      variant: 'done',
    });
  }

  if (paidTotal > 0) {
    timed.push({
      id: 'milestone-paid',
      at: closedAt ?? openedAt ?? null,
      title: 'Pagamento registrado',
      sub: fmtBrl(paidTotal),
      variant: 'done',
    });
  }

  if (status === 'fechada' && closedAt) {
    timed.push({
      id: 'milestone-closed',
      at: closedAt,
      title: 'Comanda fechada',
      sub: new Date(closedAt).toLocaleString('pt-BR'),
      variant: 'done',
    });
  }

  timed.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.at ? new Date(b.at).getTime() : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  const tail: ComandaTimelineStep[] = [];

  if (balanceDue > 0.009 && status !== 'cancelada') {
    tail.push({
      id: 'milestone-balance',
      at: null,
      title: 'Saldo pendente',
      sub: fmtBrl(balanceDue),
      variant: status === 'aberta' ? 'active' : 'todo',
    });
  }

  if (status === 'cancelada') {
    tail.push({
      id: 'milestone-cancelled',
      at: null,
      title: 'Comanda cancelada',
      variant: 'active',
    });
  }

  return [...timed, ...tail];
}
