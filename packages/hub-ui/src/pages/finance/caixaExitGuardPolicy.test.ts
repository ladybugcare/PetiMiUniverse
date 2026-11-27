import { describe, expect, it } from 'vitest';
import {
  CAIXA_EXIT_FALLBACK_CLOSE_HM,
  shouldPromptCaixaExitOnLeave,
} from './caixaExitGuardPolicy';

/** Constrói Date cujo instante corresponde a HH:mm em America/Sao_Paulo no dia civil SP. */
function atSaoPauloHm(ymd: string, hm: string): Date {
  // Offset SP: -03:00 (sem DST desde 2019)
  return new Date(`${ymd}T${hm}:00-03:00`);
}

describe('shouldPromptCaixaExitOnLeave', () => {
  const base = {
    isOpen: true,
    pendingBillingCount: 3,
    isPreviousDay: false,
  };

  it('não bloqueia sem caixa aberto ou sem pendências', () => {
    expect(
      shouldPromptCaixaExitOnLeave({
        ...base,
        isOpen: false,
        now: atSaoPauloHm('2026-11-27', '18:30'),
      }).prompt,
    ).toBe(false);
    expect(
      shouldPromptCaixaExitOnLeave({
        ...base,
        pendingBillingCount: 0,
        now: atSaoPauloHm('2026-11-27', '18:30'),
      }).prompt,
    ).toBe(false);
  });

  it('sempre bloqueia turno de dia anterior', () => {
    const d = shouldPromptCaixaExitOnLeave({
      ...base,
      isPreviousDay: true,
      now: atSaoPauloHm('2026-11-27', '10:00'),
      businessHours: { '5': { open: '08:00', close: '19:00' } },
    });
    expect(d.prompt).toBe(true);
    expect(d.reason).toBe('previous_day');
  });

  it('no meio do expediente não bloqueia (com horário da clínica)', () => {
    // 2026-11-27 é sexta (5)
    const d = shouldPromptCaixaExitOnLeave({
      ...base,
      now: atSaoPauloHm('2026-11-27', '14:00'),
      businessHours: { '5': { open: '08:00', close: '19:00' } },
    });
    expect(d.prompt).toBe(false);
    expect(d.reason).toBe('none');
  });

  it('na janela de fechamento bloqueia', () => {
    const d = shouldPromptCaixaExitOnLeave({
      ...base,
      now: atSaoPauloHm('2026-11-27', '18:15'),
      businessHours: { '5': { open: '08:00', close: '19:00' } },
      closingLeadMinutes: 60,
    });
    expect(d.prompt).toBe(true);
    expect(d.reason).toBe('closing_window');
    expect(d.closeHm).toBe('19:00');
  });

  it('após o fechamento bloqueia', () => {
    const d = shouldPromptCaixaExitOnLeave({
      ...base,
      now: atSaoPauloHm('2026-11-27', '19:30'),
      businessHours: { '5': { open: '08:00', close: '19:00' } },
    });
    expect(d.prompt).toBe(true);
    expect(d.reason).toBe('after_hours');
  });

  it('dia fechado na clínica bloqueia', () => {
    const d = shouldPromptCaixaExitOnLeave({
      ...base,
      now: atSaoPauloHm('2026-11-27', '11:00'),
      businessHours: { '5': { closed: true } },
    });
    expect(d.prompt).toBe(true);
    expect(d.reason).toBe('closed_today');
  });

  it('sem business_hours usa fallback 19h', () => {
    const mid = shouldPromptCaixaExitOnLeave({
      ...base,
      now: atSaoPauloHm('2026-11-27', '12:00'),
      businessHours: null,
    });
    expect(mid.prompt).toBe(false);

    const eve = shouldPromptCaixaExitOnLeave({
      ...base,
      now: atSaoPauloHm('2026-11-27', '18:30'),
      businessHours: {},
    });
    expect(eve.prompt).toBe(true);
    expect(eve.closeHm).toBe(CAIXA_EXIT_FALLBACK_CLOSE_HM);
  });
});
