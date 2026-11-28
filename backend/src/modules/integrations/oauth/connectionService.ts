import { supabaseAdmin } from '../../../config/supabase';
import {
  hashToken,
  randomToken,
  signAccessToken,
  verifyPkce,
  type McpScope,
} from './oauthCrypto';

export function isPetmiMcpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.PETMI_MCP_ENABLED ?? '').toLowerCase() === 'true';
}

export async function createConnection(opts: {
  userId: string;
  clinicId: string;
  unitId: string;
  scopes: string[];
  provider?: 'chatgpt';
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('hub_assistant_connections')
    .insert({
      user_id: opts.userId,
      clinic_id: opts.clinicId,
      unit_id: opts.unitId,
      provider: opts.provider ?? 'chatgpt',
      scopes: opts.scopes,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'Falha ao criar conexão');
  return { id: data.id as string };
}

export async function revokeConnection(opts: {
  connectionId: string;
  userId: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('hub_assistant_connections')
    .update({ status: 'revoked', revoked_at: now, updated_at: now })
    .eq('id', opts.connectionId)
    .eq('user_id', opts.userId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    await supabaseAdmin
      .from('hub_assistant_refresh_tokens')
      .update({ revoked_at: now })
      .eq('connection_id', opts.connectionId)
      .is('revoked_at', null);
  }
  return Boolean(data);
}

export async function listConnectionsForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_assistant_connections')
    .select('id, clinic_id, unit_id, provider, scopes, status, created_at, revoked_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function assertConnectionActive(connectionId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hub_assistant_connections')
    .select('id, status')
    .eq('id', connectionId)
    .maybeSingle();
  if (error || !data) return false;
  return data.status === 'active';
}

export async function assertClinicUserActive(userId: string, clinicId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('clinic_users')
    .select('id')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function issueAuthCode(opts: {
  userId: string;
  clinicId: string;
  unitId: string;
  scopes: string[];
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string | null;
  connectionId: string;
}): Promise<string> {
  const code = randomToken(24);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from('hub_assistant_oauth_codes').insert({
    code,
    connection_id: opts.connectionId,
    user_id: opts.userId,
    clinic_id: opts.clinicId,
    unit_id: opts.unitId,
    scopes: opts.scopes,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    code_challenge: opts.codeChallenge,
    code_challenge_method: opts.codeChallengeMethod,
    resource: opts.resource ?? null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  return code;
}

export async function exchangeAuthCode(opts: {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
}): Promise<
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      scopes: string[];
    }
  | { ok: false; error: string }
> {
  const { data, error } = await supabaseAdmin
    .from('hub_assistant_oauth_codes')
    .select('*')
    .eq('code', opts.code)
    .maybeSingle();
  if (error || !data) return { ok: false, error: 'invalid_grant' };
  if (data.consumed_at) return { ok: false, error: 'invalid_grant' };
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: 'invalid_grant' };
  }
  if (data.redirect_uri !== opts.redirectUri || data.client_id !== opts.clientId) {
    return { ok: false, error: 'invalid_grant' };
  }
  if (
    !verifyPkce(
      opts.codeVerifier,
      data.code_challenge as string,
      (data.code_challenge_method as string) || 'S256',
    )
  ) {
    return { ok: false, error: 'invalid_grant' };
  }

  await supabaseAdmin
    .from('hub_assistant_oauth_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('code', opts.code);

  const scopes = (data.scopes as string[]) ?? [];
  const accessToken = signAccessToken({
    sub: data.user_id as string,
    clinic_id: data.clinic_id as string,
    unit_id: data.unit_id as string,
    scopes,
    connection_id: data.connection_id as string,
  });

  const refreshRaw = randomToken(40);
  const refreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.from('hub_assistant_refresh_tokens').insert({
    token_hash: hashToken(refreshRaw),
    connection_id: data.connection_id,
    user_id: data.user_id,
    clinic_id: data.clinic_id,
    unit_id: data.unit_id,
    scopes,
    expires_at: refreshExpires,
  });

  return {
    ok: true,
    accessToken,
    refreshToken: refreshRaw,
    expiresIn: 3600,
    scopes,
  };
}

export async function refreshAccessToken(opts: {
  refreshToken: string;
}): Promise<
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      scopes: string[];
    }
  | { ok: false; error: string }
> {
  const tokenHash = hashToken(opts.refreshToken);
  const { data, error } = await supabaseAdmin
    .from('hub_assistant_refresh_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return { ok: false, error: 'invalid_grant' };
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: 'invalid_grant' };
  }

  const { data: conn } = await supabaseAdmin
    .from('hub_assistant_connections')
    .select('id, status, clinic_id, unit_id')
    .eq('id', data.connection_id)
    .maybeSingle();
  if (!conn || conn.status !== 'active') return { ok: false, error: 'invalid_grant' };
  const membership = await assertClinicUserActive(data.user_id as string, conn.clinic_id as string);
  if (!membership) return { ok: false, error: 'invalid_grant' };

  const clinicId = conn.clinic_id as string;
  const unitId = conn.unit_id as string;

  // Rotate refresh token
  await supabaseAdmin
    .from('hub_assistant_refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', data.id);

  const scopes = (data.scopes as string[]) ?? [];
  const accessToken = signAccessToken({
    sub: data.user_id as string,
    clinic_id: clinicId,
    unit_id: unitId,
    scopes,
    connection_id: data.connection_id as string,
  });
  const refreshRaw = randomToken(40);
  await supabaseAdmin.from('hub_assistant_refresh_tokens').insert({
    token_hash: hashToken(refreshRaw),
    connection_id: data.connection_id,
    user_id: data.user_id,
    clinic_id: clinicId,
    unit_id: unitId,
    scopes,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  return {
    ok: true,
    accessToken,
    refreshToken: refreshRaw,
    expiresIn: 3600,
    scopes,
  };
}

export function parseScopes(raw: string | undefined | null): string[] {
  if (!raw) return ['petmi.grooming.read', 'petmi.grooming.write', 'offline_access'];
  return raw
    .split(/[\s+]+/)
    .map((s) => s.trim())
    .filter(Boolean) as McpScope[];
}
