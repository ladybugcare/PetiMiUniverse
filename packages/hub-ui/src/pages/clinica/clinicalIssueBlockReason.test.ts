import { describe, expect, it } from 'vitest';
import {
  resolveExamIssueBlockReason,
  resolvePrescriptionIssueBlockReason,
  resolveReferralIssueBlockReason,
} from './clinicalIssueBlockReason';

const ready = { pet_id: 'p1', hub_staff_member_id: 's1' };

describe('resolvePrescriptionIssueBlockReason', () => {
  it('não trata receita vazia como erro (evita toast falso ao finalizar)', () => {
    expect(
      resolvePrescriptionIssueBlockReason({ readOnly: false, hasItems: false, encounter: ready }),
    ).toBeNull();
  });

  it('bloqueia emissão real sem pet/vet quando há itens', () => {
    expect(
      resolvePrescriptionIssueBlockReason({
        readOnly: false,
        hasItems: true,
        encounter: { pet_id: null, hub_staff_member_id: 's1' },
      }),
    ).toMatch(/pet/i);
    expect(
      resolvePrescriptionIssueBlockReason({
        readOnly: false,
        hasItems: true,
        encounter: { pet_id: 'p1', hub_staff_member_id: null },
      }),
    ).toMatch(/veterin/i);
  });

  it('somente leitura só importa quando há itens', () => {
    expect(
      resolvePrescriptionIssueBlockReason({ readOnly: true, hasItems: false, encounter: ready }),
    ).toBeNull();
    expect(
      resolvePrescriptionIssueBlockReason({ readOnly: true, hasItems: true, encounter: ready }),
    ).toMatch(/somente leitura/i);
  });
});

describe('resolveExamIssueBlockReason', () => {
  it('lista vazia não gera bloqueio', () => {
    expect(resolveExamIssueBlockReason(ready, 0)).toBeNull();
  });

  it('com exames, exige pet e veterinário', () => {
    expect(resolveExamIssueBlockReason({ pet_id: null, hub_staff_member_id: 's1' }, 2)).toMatch(
      /pet/i,
    );
    expect(resolveExamIssueBlockReason(ready, 1)).toBeNull();
  });
});

describe('resolveReferralIssueBlockReason', () => {
  it('lista vazia não gera bloqueio', () => {
    expect(resolveReferralIssueBlockReason(ready, 0)).toBeNull();
  });

  it('com encaminhamentos, exige pet e veterinário', () => {
    expect(
      resolveReferralIssueBlockReason({ pet_id: 'p1', hub_staff_member_id: null }, 1),
    ).toMatch(/veterin/i);
    expect(resolveReferralIssueBlockReason(ready, 1)).toBeNull();
  });
});
