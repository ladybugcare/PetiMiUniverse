import { randomInt } from 'node:crypto';
import { QA_CLINIC_ID } from './constants';
import { hubApi, newFixtureMarker } from './apiHub';

export type QaGuardian = { id: string; full_name: string };

function validCpfDigits11(): string {
  // CPF sintético válido (apenas para QA; não é documento real).
  const base = Array.from({ length: 9 }, () => randomInt(0, 9));
  const calc = (nums: number[], factor: number) => {
    const sum = nums.reduce((acc, n, idx) => acc + n * (factor - idx), 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(base, 10);
  const d2 = calc([...base, d1], 11);
  return [...base, d1, d2].join('');
}

export async function createQaGuardianZeroCredit(token: string, tag?: string): Promise<QaGuardian> {
  const marker = tag ?? newFixtureMarker('QA_ETAPA_A_TUTOR');
  const taxId = validCpfDigits11();
  const res = await hubApi<{ guardian: { id: string; full_name: string } }>(token, '/api/hub/guardians', {
    method: 'POST',
    body: {
      clinic_id: QA_CLINIC_ID,
      full_name: `[QA EtapaA] ${marker}`,
      phone: `1199${String(Date.now()).slice(-7)}`,
      email: `qa.etapaa.${Date.now()}@petmi.test`,
      tax_id: taxId,
      notes: 'Fixture Etapa A Playwright — crédito zero esperado',
    },
  });
  const g = res.guardian;
  if (!g?.id) throw new Error('Falha ao criar tutor QA');
  const credit = await hubApi<{ balance: number }>(
    token,
    `/api/hub/finance/credit-balance?clinic_id=${QA_CLINIC_ID}&guardian_id=${g.id}`,
  );
  if (Number(credit.balance ?? 0) > 0.009) {
    throw new Error(`Tutor QA deveria ter crédito zero (saldo ${credit.balance})`);
  }
  return { id: g.id, full_name: g.full_name };
}

export async function fetchGuardianCreditBalance(token: string, guardianId: string): Promise<number> {
  const credit = await hubApi<{ balance: number }>(
    token,
    `/api/hub/finance/credit-balance?clinic_id=${QA_CLINIC_ID}&guardian_id=${guardianId}`,
  );
  return Number(credit.balance ?? 0);
}