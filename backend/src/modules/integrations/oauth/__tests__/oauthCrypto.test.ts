import {
  hashToken,
  signAccessToken,
  verifyAccessToken,
  verifyPkce,
} from '../oauthCrypto';
import { createHash } from 'crypto';

describe('oauthCrypto', () => {
  it('assina e verifica access token', () => {
    const token = signAccessToken({
      sub: 'user-1',
      clinic_id: 'clinic-1',
      unit_id: 'unit-1',
      scopes: ['petmi.grooming.read'],
      connection_id: 'conn-1',
      ttlSec: 60,
    });
    const claims = verifyAccessToken(token);
    expect(claims?.sub).toBe('user-1');
    expect(claims?.clinic_id).toBe('clinic-1');
    expect(claims?.unit_id).toBe('unit-1');
  });

  it('rejeita token adulterado', () => {
    const token = signAccessToken({
      sub: 'user-1',
      clinic_id: 'clinic-1',
      unit_id: 'unit-1',
      scopes: [],
      connection_id: 'conn-1',
    });
    const bad = `${token.slice(0, -4)}xxxx`;
    expect(verifyAccessToken(bad)).toBeNull();
  });

  it('valida PKCE S256', () => {
    const verifier = 'test-verifier-123456789012345678901234';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkce(verifier, challenge, 'S256')).toBe(true);
    expect(verifyPkce(verifier, 'nope', 'S256')).toBe(false);
  });

  it('hashToken é estável', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});
