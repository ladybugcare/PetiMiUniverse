jest.mock('../../../config/supabase.js', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock('../hubClinicalTimelineController.js', () => ({
  recordTimelineEvent: jest.fn(),
}));

import { assertReopenReason, isGenericClinicalCaseTitle, resolveAutoCaseTitle } from '../hubClinicalCasesController.js';

describe('resolveAutoCaseTitle', () => {
  it('usa a queixa em vez de Atendimento avulso', () => {
    expect(
      resolveAutoCaseTitle({
        chief_complaint: 'Prurido intenso',
        started_at: '2026-07-01T12:00:00.000Z',
      }),
    ).toBe('Prurido intenso');
  });

  it('ignora títulos genéricos e cai na consulta datada', () => {
    expect(
      resolveAutoCaseTitle({
        case_title: 'Atendimento avulso',
        appointment_title: 'Consulta',
        started_at: '2026-07-01T15:00:00.000-03:00',
      }),
    ).toBe('Consulta — 01/07/2026');
  });

  it('reconhece fallbacks genéricos', () => {
    expect(isGenericClinicalCaseTitle('Atendimento avulso')).toBe(true);
    expect(isGenericClinicalCaseTitle('Consulta — 01/07/2026')).toBe(true);
    expect(isGenericClinicalCaseTitle('Otite em Atum')).toBe(false);
  });
});

describe('assertReopenReason', () => {
  it('exige motivo com pelo menos 8 caracteres', () => {
    expect(() => assertReopenReason('curto')).toThrow(/mínimo 8/);
    expect(assertReopenReason('Retorno da dermatite')).toBe('Retorno da dermatite');
  });
});
