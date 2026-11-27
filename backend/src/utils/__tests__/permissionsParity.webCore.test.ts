import * as fs from 'fs';
import * as path from 'path';
import { PERMISSIONS as backendPermissions } from '../permissions';
import {
  HUB_OPERATIONAL_AREAS,
  OPERATIONAL_AREA_PERMISSIONS as backendAreas,
} from '../operationalAreas';

/**
 * Paridade backend ↔ packages/web-core (cópias manuais).
 * Extrai listas do fonte web-core para evitar import React no Jest do backend.
 * Falha se qualquer papel ou área divergir — API é a fonte da verdade.
 */

const ROLE_KEYS = [
  'CADMIN',
  'CMANAGER',
  'CASSISTANT',
  'CVET_INTERNAL',
  'CGROOMER',
  'CFINANCE',
  'CSTAFF',
] as const;

function extractBracketBlock(src: string, key: string): string {
  const re = new RegExp(`(?:^|\\n)\\s{2}${key}:\\s*\\[`, 'm');
  const m = re.exec(src);
  if (!m || m.index === undefined) {
    throw new Error(`Bloco não encontrado: ${key}`);
  }
  const start = m.index + m[0].indexOf('[');
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  throw new Error(`Bloco não fechado: ${key}`);
}

function extractPermissionStrings(block: string): string[] {
  return [...block.matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function sorted(list: readonly string[]): string[] {
  return [...list].sort();
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

  const permsSrc = fs.readFileSync(webCorePermsPath, 'utf8');
  const areasSrc = fs.readFileSync(webCoreAreasPath, 'utf8');

  it('mesmos papéis de clínica', () => {
    const webRoles = ROLE_KEYS.filter((role) =>
      new RegExp(`(?:^|\\n)\\s{2}${role}:\\s*\\[`, 'm').test(permsSrc),
    ).sort();
    const backendRoles = Object.keys(backendPermissions).sort();
    expect(webRoles).toEqual(backendRoles);
  });

  it.each(ROLE_KEYS)('lista de permissões idêntica para %s', (role) => {
    const webList = extractPermissionStrings(extractBracketBlock(permsSrc, role));
    expect(sorted(webList)).toEqual(sorted(backendPermissions[role]));
  });

  it('CFINANCE: estorno/adjust sim; gaveta (cash.session) não', () => {
    const webList = extractPermissionStrings(extractBracketBlock(permsSrc, 'CFINANCE'));
    expect(webList).toContain('hub.payments.reverse');
    expect(webList).toContain('hub.financial.adjust');
    expect(webList).not.toContain('hub.cash.session');
    expect(backendPermissions.CFINANCE).toContain('hub.payments.reverse');
    expect(backendPermissions.CFINANCE).not.toContain('hub.cash.session');
  });

  it('CMANAGER: reverse e adjust presentes nos dois mapas', () => {
    const webList = extractPermissionStrings(extractBracketBlock(permsSrc, 'CMANAGER'));
    expect(webList).toEqual(
      expect.arrayContaining(['hub.payments.reverse', 'hub.financial.adjust']),
    );
    expect(backendPermissions.CMANAGER).toEqual(
      expect.arrayContaining(['hub.payments.reverse', 'hub.financial.adjust']),
    );
  });

  it.each([...HUB_OPERATIONAL_AREAS])('área operacional idêntica: %s', (area) => {
    const webList = extractPermissionStrings(extractBracketBlock(areasSrc, area));
    expect(sorted(webList)).toEqual(sorted(backendAreas[area]));
  });
});
