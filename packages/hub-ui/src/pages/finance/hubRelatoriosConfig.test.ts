import { describe, expect, it } from 'vitest';
import {
  CLINICAL_AUDIENCE_REPORT_IDS,
  HUB_REPORTS,
  HUB_REPORT_LINKS,
  canAccessReportsArea,
  isClinicalReportsAudience,
  reportAllowed,
  reportLinkAllowed,
  usesClinicalStockScope,
} from './hubRelatoriosConfig';

function perms(...list: string[]) {
  const set = new Set(list);
  return (p: string) => set.has(p);
}

/** Perfil típico: CSTAFF + área clínica. */
const vetPerms = perms(
  'hub.clinic.read',
  'hub.clinic.write',
  'hub.appointments.read',
  'hub.inventory.read',
  'hub.staff.read',
  'hub.guardians.read',
  'hub.pets.read',
  'hub.service_types.read',
  'hub.commissions.read_own',
);

describe('audiência clínica de relatórios', () => {
  it('identifica vet sem financeiro/relatórios gerais', () => {
    expect(isClinicalReportsAudience(vetPerms)).toBe(true);
    expect(usesClinicalStockScope(vetPerms)).toBe(true);
  });

  it('não restringe quem tem hub.reports.read', () => {
    const p = perms('hub.clinic.read', 'hub.reports.read', 'hub.inventory.read');
    expect(isClinicalReportsAudience(p)).toBe(false);
  });

  it('estoque clínico deixa de valer com inventory.write', () => {
    const p = perms('hub.clinic.read', 'hub.inventory.read', 'hub.inventory.write');
    expect(isClinicalReportsAudience(p)).toBe(true);
    expect(usesClinicalStockScope(p)).toBe(false);
  });

  it('catálogo do vet fica na allowlist', () => {
    const visible = HUB_REPORTS.filter((r) => reportAllowed(vetPerms, r)).map((r) => r.id);
    expect(visible.sort()).toEqual([...CLINICAL_AUDIENCE_REPORT_IDS].sort());
  });

  it('remove CRM, no-shows gerais e curva ABC/giro', () => {
    for (const id of [
      'absent-clients',
      'client-cohorts',
      'birthdays',
      'no-shows',
      'stock-abc',
      'stock-turnover',
    ] as const) {
      const def = HUB_REPORTS.find((r) => r.id === id)!;
      expect(reportAllowed(vetPerms, def)).toBe(false);
    }
  });

  it('mantém links de alertas e impressões do dia', () => {
    const links = HUB_REPORT_LINKS.filter((l) => reportLinkAllowed(vetPerms, l)).map((l) => l.id);
    expect(links.sort()).toEqual(['day-prints', 'stock-alerts']);
  });

  it('financeiro continua liberando visão financeira', () => {
    const fin = perms('hub.financial.read', 'hub.reports.read');
    expect(reportAllowed(fin, HUB_REPORTS.find((r) => r.id === 'finance-overview')!)).toBe(true);
  });
});

describe('hub.reports.read sem super-read', () => {
  it('não libera cards de domínio só com hub.reports.read', () => {
    const onlyReports = perms('hub.reports.read');
    expect(canAccessReportsArea(onlyReports)).toBe(true);
    for (const id of ['stock-position', 'absent-clients', 'finance-overview', 'no-shows'] as const) {
      const def = HUB_REPORTS.find((r) => r.id === id)!;
      expect(reportAllowed(onlyReports, def)).toBe(false);
    }
  });

  it('libera card de estoque com hub.inventory.read', () => {
    const p = perms('hub.inventory.read', 'hub.reports.read');
    expect(reportAllowed(p, HUB_REPORTS.find((r) => r.id === 'stock-position')!)).toBe(true);
  });

  it('vet acessa área sem hub.reports.read', () => {
    expect(canAccessReportsArea(vetPerms)).toBe(true);
  });
});
