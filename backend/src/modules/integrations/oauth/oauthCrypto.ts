import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto';

function secret(): string {
  const s = process.env.PETMI_OAUTH_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
  if (!s) {
    if (process.env.NODE_ENV === 'test') return 'test-oauth-secret';
    throw new Error('PETMI_OAUTH_JWT_SECRET não configurado');
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64url');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export type AccessTokenClaims = {
  sub: string;
  clinic_id: string;
  unit_id: string;
  scopes: string[];
  connection_id: string;
  provider: 'chatgpt';
  exp: number;
  iat: number;
  iss: string;
  aud: string;
};

export function signAccessToken(
  claims: Omit<AccessTokenClaims, 'iat' | 'exp' | 'iss' | 'aud' | 'provider'> & {
    ttlSec?: number;
    provider?: 'chatgpt';
  },
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenClaims = {
    sub: claims.sub,
    clinic_id: claims.clinic_id,
    unit_id: claims.unit_id,
    scopes: claims.scopes,
    connection_id: claims.connection_id,
    provider: claims.provider ?? 'chatgpt',
    iat: now,
    exp: now + (claims.ttlSec ?? 3600),
    iss: process.env.PETMI_OAUTH_ISSUER || publicApiBase(),
    aud: process.env.PETMI_MCP_RESOURCE || `${publicApiBase()}/mcp`,
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret()).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret()).update(`${header}.${body}`).digest();
  let actual: Buffer;
  try {
    actual = fromB64url(sig!);
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body!).toString()) as AccessTokenClaims;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.sub || !payload.clinic_id || !payload.unit_id || !payload.connection_id) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== 'S256') return false;
  const digest = createHash('sha256').update(verifier).digest();
  return b64url(digest) === challenge;
}

export function publicApiBase(): string {
  const raw =
    process.env.PETMI_PUBLIC_API_URL ||
    process.env.PUBLIC_API_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    'http://localhost:3000';
  if (raw.startsWith('http')) return raw.replace(/\/$/, '');
  return `https://${raw.replace(/\/$/, '')}`;
}

export function hubWebBase(): string {
  return (process.env.PETMI_HUB_WEB_URL || process.env.HUB_WEB_URL || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
}

export const MCP_SCOPES = [
  'petmi.grooming.read',
  'petmi.grooming.write',
  'petmi.clinical.read',
  'petmi.clinical.write',
  'offline_access',
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];
