import { describe, expect, it } from 'vitest';
import {
  buildLoginHref,
  isAuthShellReturnPath,
  safeInternalReturnPath,
} from '../../web-core/src/loginReturnUrl';

describe('loginReturnUrl', () => {
  it('safeInternalReturnPath rejeita externo e aceita path Hub', () => {
    expect(safeInternalReturnPath(null)).toBeNull();
    expect(safeInternalReturnPath('https://evil.example/x')).toBeNull();
    expect(safeInternalReturnPath('//evil.example')).toBeNull();
    expect(safeInternalReturnPath('/hub/caixa/comanda/abc')).toBe('/hub/caixa/comanda/abc');
    expect(safeInternalReturnPath('/hub/financeiro/comanda/1?tab=pagamentos')).toBe(
      '/hub/financeiro/comanda/1?tab=pagamentos',
    );
  });

  it('isAuthShellReturnPath cobre login e páginas públicas', () => {
    expect(isAuthShellReturnPath('/login')).toBe(true);
    expect(isAuthShellReturnPath('/login?redirect=%2Fhub')).toBe(true);
    expect(isAuthShellReturnPath('/signup')).toBe(true);
    expect(isAuthShellReturnPath('/hub/dashboard')).toBe(false);
  });

  it('buildLoginHref guarda deep link de comanda', () => {
    expect(buildLoginHref('/hub/caixa/comanda/c1')).toBe(
      '/login?redirect=%2Fhub%2Fcaixa%2Fcomanda%2Fc1',
    );
    expect(buildLoginHref('/hub/financeiro/comanda/c2?x=1')).toBe(
      '/login?redirect=%2Fhub%2Ffinanceiro%2Fcomanda%2Fc2%3Fx%3D1',
    );
  });

  it('buildLoginHref não aninha redirect em páginas de auth', () => {
    expect(buildLoginHref('/login')).toBe('/login');
    expect(buildLoginHref('/signup')).toBe('/login');
    expect(buildLoginHref('/')).toBe('/login');
    expect(buildLoginHref(null)).toBe('/login');
  });
});
