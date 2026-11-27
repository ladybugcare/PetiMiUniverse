/**
 * Quando o exit-guard do Caixa deve interromper a navegação.
 * No meio do expediente com turno aberto, pendências são esperadas — não bloquear.
 */

import type { HubPublicBusinessHours } from '../public-profile/clinicPublicProfileTypes';

/** Minutos antes do fechamento em que o aviso volta a ser útil. */
export const CAIXA_EXIT_CLOSING_LEAD_MINUTES = 60;

/** Fallback se a clínica não cadastrou business_hours no perfil público. */
export const CAIXA_EXIT_FALLBACK_CLOSE_HM = '19:00';

export type CaixaExitPromptReason =
  | 'none'
  | 'previous_day'
  | 'closing_window'
  | 'after_hours'
  | 'closed_today';

export type CaixaExitPromptDecision = {
  prompt: boolean;
  reason: CaixaExitPromptReason;
  /** HH:mm usado como referência de fechamento (quando aplicável). */
  closeHm: string | null;
};

function parseHmToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutos desde meia-noite em America/Sao_Paulo. */
export function minutesOfDaySaoPaulo(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // en-GB às vezes devolve "24" na meia-noite
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

/** 0 = domingo … 6 = sábado (mesmo índice do perfil público). */
export function weekdaySaoPaulo(now: Date = new Date()): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? now.getDay();
}

function resolveTodayClose(
  hours: HubPublicBusinessHours | null | undefined,
  now: Date,
): { kind: 'open' | 'closed' | 'unknown'; closeHm: string | null; closeMins: number | null } {
  if (!hours || Object.keys(hours).length === 0) {
    return {
      kind: 'unknown',
      closeHm: CAIXA_EXIT_FALLBACK_CLOSE_HM,
      closeMins: parseHmToMinutes(CAIXA_EXIT_FALLBACK_CLOSE_HM),
    };
  }
  const key = String(weekdaySaoPaulo(now)) as keyof HubPublicBusinessHours;
  const day = hours[key];
  if (!day || day.closed || !day.close) {
    return { kind: 'closed', closeHm: null, closeMins: null };
  }
  const closeMins = parseHmToMinutes(day.close);
  if (closeMins == null) {
    return {
      kind: 'unknown',
      closeHm: CAIXA_EXIT_FALLBACK_CLOSE_HM,
      closeMins: parseHmToMinutes(CAIXA_EXIT_FALLBACK_CLOSE_HM),
    };
  }
  return { kind: 'open', closeHm: day.close, closeMins };
}

/**
 * Decide se deve mostrar o modal ao sair de /hub/caixa.
 * Horário do funcionário não entra: o caixa é da unidade; o sinal certo é
 * fechamento da clínica (ou fallback 19h SP) + turno de dia anterior.
 */
export function shouldPromptCaixaExitOnLeave(input: {
  isOpen: boolean;
  pendingBillingCount: number;
  isPreviousDay: boolean;
  businessHours?: HubPublicBusinessHours | null;
  now?: Date;
  closingLeadMinutes?: number;
}): CaixaExitPromptDecision {
  const {
    isOpen,
    pendingBillingCount,
    isPreviousDay,
    businessHours = null,
    now = new Date(),
    closingLeadMinutes = CAIXA_EXIT_CLOSING_LEAD_MINUTES,
  } = input;

  if (!isOpen || pendingBillingCount <= 0) {
    return { prompt: false, reason: 'none', closeHm: null };
  }
  if (isPreviousDay) {
    return { prompt: true, reason: 'previous_day', closeHm: null };
  }

  const today = resolveTodayClose(businessHours, now);
  if (today.kind === 'closed') {
    return { prompt: true, reason: 'closed_today', closeHm: null };
  }

  const nowMins = minutesOfDaySaoPaulo(now);
  const closeMins = today.closeMins ?? parseHmToMinutes(CAIXA_EXIT_FALLBACK_CLOSE_HM)!;
  const closeHm = today.closeHm ?? CAIXA_EXIT_FALLBACK_CLOSE_HM;
  const leadStart = Math.max(0, closeMins - Math.max(0, closingLeadMinutes));

  if (nowMins >= closeMins) {
    return { prompt: true, reason: 'after_hours', closeHm };
  }
  if (nowMins >= leadStart) {
    return { prompt: true, reason: 'closing_window', closeHm };
  }
  return { prompt: false, reason: 'none', closeHm };
}

export function caixaExitPromptCopy(reason: CaixaExitPromptReason, closeHm: string | null): {
  title: string;
  bodyLead: string;
} {
  switch (reason) {
    case 'previous_day':
      return {
        title: 'Turno de um dia anterior ainda aberto',
        bodyLead: 'Há pendências de cobrança neste turno antigo.',
      };
    case 'closing_window':
      return {
        title: 'Quase no horário de fechar',
        bodyLead: closeHm
          ? `A clínica fecha às ${closeHm}. Há pendências no caixa.`
          : 'Está perto do fechamento e há pendências no caixa.',
      };
    case 'after_hours':
    case 'closed_today':
      return {
        title: 'Fora do horário — caixa ainda aberto',
        bodyLead: 'Há pendências de cobrança e o expediente já passou.',
      };
    default:
      return {
        title: 'Caixa aberto com pendências',
        bodyLead: 'Há itens pendentes de cobrança.',
      };
  }
}
