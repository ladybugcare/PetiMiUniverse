/**
 * Horários ao editar série (escopo future/all).
 * Não copiar starts_at/ends_at absolutos para todas as ocorrências — isso colapsa
 * a agenda num único dia. Preservar a data de cada row e aplicar o novo horário.
 */

/** Mantém a hora de `originalTs` e aplica o calendário `newDate` (YYYY-MM-DD), em UTC. */
export function shiftTimestampToDate(originalTs: string, newDate: string): string {
  const orig = new Date(originalTs);
  const [y, m, d] = newDate.split('-').map(Number);
  orig.setUTCFullYear(y!, m! - 1, d!);
  return orig.toISOString();
}

function occurrenceDateOf(rowStartsAt: string, rowOccurrenceDate?: string | null): string {
  const fromSeries = String(rowOccurrenceDate ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromSeries)) return fromSeries;
  return String(rowStartsAt).slice(0, 10);
}

/** Deslocamento em ms entre dois instantes (para pernas L&T relativas ao banho âncora). */
export function scheduleDeltaMs(fromIso: string, toIso: string): number {
  return new Date(toIso).getTime() - new Date(fromIso).getTime();
}

export function addMsToIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString();
}

export type SeriesSchedulePatchInput = {
  scope: 'this' | 'future' | 'all';
  targetId: string;
  anchorId: string;
  /** `pickup_route` usa delta relativo; demais usam data da ocorrência + horário do template. */
  appointmentKind: string | null | undefined;
  rowStartsAt: string;
  rowEndsAt: string;
  rowOccurrenceDate?: string | null;
  /** Novo horário/data da ocorrência editada (template). */
  patchStartsAt?: string;
  patchEndsAt?: string;
  /** starts_at da ocorrência âncora antes do patch (base do delta das pernas). */
  anchorOldStartsAt: string;
  anchorOldEndsAt: string;
};

export type SeriesSchedulePatchResult = {
  starts_at: string;
  ends_at: string;
};

/**
 * Resolve starts/ends para um row ao propagar edição de série.
 * Retorna null se não há mudança de agenda neste row.
 */
export function resolveSeriesScopedSchedulePatch(
  input: SeriesSchedulePatchInput,
): SeriesSchedulePatchResult | null {
  const { patchStartsAt, patchEndsAt } = input;
  if (patchStartsAt === undefined && patchEndsAt === undefined) return null;

  const isAnchor = input.targetId === input.anchorId;
  const scopeThis = input.scope === 'this';

  // Âncora ou «somente este»: valores absolutos do formulário.
  if (scopeThis || isAnchor) {
    return {
      starts_at: patchStartsAt ?? input.rowStartsAt,
      ends_at: patchEndsAt ?? input.rowEndsAt,
    };
  }

  const isPickup = String(input.appointmentKind ?? '') === 'pickup_route';

  // Pernas L&T: manter espaçamento relativo ao banho (mesmo delta do âncora).
  if (isPickup) {
    const newAnchorStart = patchStartsAt ?? input.anchorOldStartsAt;
    const delta = scheduleDeltaMs(input.anchorOldStartsAt, newAnchorStart);
    let starts = addMsToIso(input.rowStartsAt, delta);
    let ends = addMsToIso(input.rowEndsAt, delta);
    // Se a duração do âncora mudou e só o ends foi relevante para o banho,
    // pernas preservam a própria duração (já aplicada via delta nos dois lados).
    if (patchStartsAt === undefined && patchEndsAt !== undefined) {
      const endDelta = scheduleDeltaMs(input.anchorOldEndsAt, patchEndsAt);
      starts = input.rowStartsAt;
      ends = addMsToIso(input.rowEndsAt, endDelta);
    }
    return { starts_at: starts, ends_at: ends };
  }

  // Banho / bloco: preservar data da ocorrência, aplicar horário do template.
  const occDate = occurrenceDateOf(input.rowStartsAt, input.rowOccurrenceDate);
  const starts = patchStartsAt
    ? shiftTimestampToDate(patchStartsAt, occDate)
    : input.rowStartsAt;
  let ends: string;
  if (patchEndsAt) {
    ends = shiftTimestampToDate(patchEndsAt, occDate);
  } else if (patchStartsAt) {
    const durationMs =
      new Date(input.rowEndsAt).getTime() - new Date(input.rowStartsAt).getTime();
    ends = addMsToIso(starts, durationMs);
  } else {
    ends = input.rowEndsAt;
  }

  if (new Date(ends).getTime() <= new Date(starts).getTime()) {
    const durationMs = Math.max(
      60_000,
      new Date(input.rowEndsAt).getTime() - new Date(input.rowStartsAt).getTime(),
    );
    ends = addMsToIso(starts, durationMs);
  }

  return { starts_at: starts, ends_at: ends };
}
