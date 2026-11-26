import * as fs from 'fs';
import * as path from 'path';
import { PERMISSIONS as backendPermissions } from '../permissions';
import { OPERATIONAL_AREA_PERMISSIONS as backendAreas } from '../operationalAreas';

/**
 * Paridade estrutural backend ↔ packages/web-core (cópias manuais).
 * Extrai chaves de role e áreas do fonte web-core para evitar import React no Jest do backend.
 */
function extractRoleKeys(src: string): string[] {
  const roles: string[] = [];
  const re = /^\s{2}(CADMIN|CMANAGER|CASSISTANT|CVET_INTERNAL|CGROOMER|CFINANCE|CSTAFF):\s*\[/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) roles.push(m[1]);
  return roles;
}

function extractPermissionStrings(block: string): string[] {
  return [...block.matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('paridade permissions web-core ↔ backend', () => {
  const webCorePermsPath = path.resolve(
    __dirname,
    '../../../../packages/web-core/src/permissions.ts',
  );
  const webCoreAreasPath = path.resolve(
    __dirname,
    '../../../../packages/web-core/src/operationalAreas.ts',
  );

  it('mesmos papéis de clínica', () => {
    const src = fs.readFileSync(webCorePermsPath, 'utf8');
    const webRoles = extractRoleKeys(src).sort();
    const backendRoles = Object.keys(backendPermissions).sort();
    expect(webRoles).toEqual(backendRoles);
  });

  it('CASSISTANT mantém hub.financial.read e hub.reports.read (sem alteração nesta fatia)', () => {
    expect(backendPermissions.CASSISTANT.includes('hub.financial.read')).toBe(true);
    expect(backendPermissions.CASSISTANT.includes('hub.reports.read')).toBe(true);
  });

  it('áreas operacionais: caixa/financeiro concedem reports+financial; clinica concede commissions.read_own', () => {
    expect(backendAreas.caixa.includes('hub.reports.read')).toBe(true);
    expect(backendAreas.financeiro.includes('hub.financial.read')).toBe(true);
    expect(backendAreas.clinica.includes('hub.commissions.read_own')).toBe(true);
    expect(backendAreas.clinica.includes('hub.reports.read')).toBe(false);

    const areasSrc = fs.readFileSync(webCoreAreasPath, 'utf8');
    expect(areasSrc).toContain("'hub.commissions.read_own'");
    expect(extractPermissionStrings(areasSrc)).toEqual(
      expect.arrayContaining(['hub.reports.read', 'hub.financial.read', 'hub.commissions.read_own']),
    );
  });
});
