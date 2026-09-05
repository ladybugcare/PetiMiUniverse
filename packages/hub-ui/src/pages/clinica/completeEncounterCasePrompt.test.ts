import { describe, expect, it } from 'vitest';
import {
  buildCaseAfterCompletePrompt,
  caseAfterCompleteSuccessMessage,
  shouldPromptCaseAfterComplete,
} from './caseAfterCompletePrompt';

describe('shouldPromptCaseAfterComplete', () => {
  it('pede decisão quando o caso está ativo', () => {
    expect(shouldPromptCaseAfterComplete({ caseId: 'c1', status: 'active' })).toBe(true);
  });

  it('pede decisão quando o caso está em monitoramento', () => {
    expect(shouldPromptCaseAfterComplete({ caseId: 'c1', status: 'monitoring' })).toBe(true);
  });

  it('não pergunta sem caso', () => {
    expect(shouldPromptCaseAfterComplete({ caseId: null, status: 'active' })).toBe(false);
  });

  it('não pergunta se o caso já foi encerrado', () => {
    expect(shouldPromptCaseAfterComplete({ caseId: 'c1', status: 'resolved' })).toBe(false);
    expect(shouldPromptCaseAfterComplete({ caseId: 'c1', status: 'cancelled' })).toBe(false);
  });

  it('não pergunta com internação aberta no caso', () => {
    expect(
      shouldPromptCaseAfterComplete({ caseId: 'c1', status: 'active', hasOpenHospitalization: true }),
    ).toBe(false);
  });
});

describe('buildCaseAfterCompletePrompt', () => {
  it('usa a queixa quando o título do caso é genérico', () => {
    const prompt = buildCaseAfterCompletePrompt({
      caseId: 'c1',
      status: 'active',
      title: 'Consulta',
      chiefComplaint: 'Dermatite no Thor',
      pendingExamsCount: 2,
    });
    expect(prompt).toEqual({
      caseId: 'c1',
      title: 'Dermatite no Thor',
      status: 'active',
      pendingExamsCount: 2,
    });
  });

  it('devolve nulo quando não deve perguntar', () => {
    expect(
      buildCaseAfterCompletePrompt({ caseId: 'c1', status: 'resolved', title: 'Dermatite' }),
    ).toBeNull();
  });
});

describe('caseAfterCompleteSuccessMessage', () => {
  it('só avisa quando o status do caso mudou', () => {
    expect(caseAfterCompleteSuccessMessage('unchanged')).toBeNull();
    expect(caseAfterCompleteSuccessMessage('monitoring')).toBe('Caso em monitoramento');
    expect(caseAfterCompleteSuccessMessage('resolved')).toBe('Caso marcado como resolvido');
  });
});
