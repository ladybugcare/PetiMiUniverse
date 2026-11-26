import * as fs from 'fs';
import * as path from 'path';
import {
  CLIENT_CONTROLLED_PDF_REPORT_IDS,
  HUB_REPORTS,
  SCHEDULABLE_REPORT_IDS,
  SERVER_SIDE_PDF_REPORT_IDS,
} from '../reportsContract';

describe('hub reports contract', () => {
  it('paridade com packages/hub-reports-contract', () => {
    const pkgPath = path.resolve(
      __dirname,
      '../../../../../packages/hub-reports-contract/src/index.ts',
    );
    const pkgSrc = fs.readFileSync(pkgPath, 'utf8');
    const backendSrc = fs.readFileSync(
      path.resolve(__dirname, '../reportsContract.ts'),
      'utf8',
    );
    expect(backendSrc).toBe(pkgSrc);
  });

  it('todo report_id agendável está no catálogo', () => {
    const ids = new Set(HUB_REPORTS.map((r) => r.id));
    for (const id of SCHEDULABLE_REPORT_IDS) {
      expect(ids.has(id)).toBe(true);
      const def = HUB_REPORTS.find((r) => r.id === id)!;
      expect(def.operations.schedule).toBe(true);
    }
  });

  it('conjunto residual PDF não cresce além do catálogo e não overlap server-side', () => {
    const catalog = new Set(HUB_REPORTS.map((r) => r.id));
    for (const id of CLIENT_CONTROLLED_PDF_REPORT_IDS) {
      expect(catalog.has(id)).toBe(true);
      expect((SERVER_SIDE_PDF_REPORT_IDS as readonly string[]).includes(id)).toBe(false);
    }
    // Gate: se migrar para server-side, remova do residual — tamanho atual documentado.
    expect(CLIENT_CONTROLLED_PDF_REPORT_IDS.length).toBeLessThanOrEqual(HUB_REPORTS.length);
    expect(CLIENT_CONTROLLED_PDF_REPORT_IDS.length).toBe(HUB_REPORTS.length);
  });

  it('hub.reports.read não aparece em permissionsAny de nenhum relatório', () => {
    for (const r of HUB_REPORTS) {
      expect(r.permissionsAny.includes('hub.reports.read')).toBe(false);
    }
  });
});
