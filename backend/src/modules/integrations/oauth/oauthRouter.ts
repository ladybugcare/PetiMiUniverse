import { Router, type Request, type Response } from 'express';
import { authenticateUser } from '../../../middleware/authMiddleware';
import { supabaseAdmin } from '../../../config/supabase';
import { MCP_SCOPES, publicApiBase } from './oauthCrypto';
import {
  assertClinicUserActive,
  createConnection,
  exchangeAuthCode,
  isPetmiMcpEnabled,
  issueAuthCode,
  listConnectionsForUser,
  parseScopes,
  refreshAccessToken,
  revokeConnection,
} from './connectionService';
import { oauthConsentUiHandler } from './consentUi';

const oauthRouter = Router();

/** Consentimento na API (Railway) — evita Vercel Authentication no Hub staging. */
oauthRouter.get('/consent-ui', oauthConsentUiHandler);

function resourceMetadataUrl(): string {
  return `${publicApiBase()}/.well-known/oauth-protected-resource`;
}

function authorizationServerUrl(): string {
  return `${publicApiBase()}/.well-known/oauth-authorization-server`;
}

/** Protected resource metadata (RFC 9728). */
export function oauthProtectedResourceHandler(_req: Request, res: Response) {
  const resource = process.env.PETMI_MCP_RESOURCE || `${publicApiBase()}/mcp`;
  res.json({
    resource,
    authorization_servers: [publicApiBase()],
    scopes_supported: [...MCP_SCOPES],
    resource_documentation: 'https://petmi.app',
  });
}

/** Authorization server metadata. */
export function oauthAuthorizationServerHandler(_req: Request, res: Response) {
  const base = publicApiBase();
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...MCP_SCOPES],
    client_id_metadata_document_supported: true,
  });
}

/** CIMD / DCR mínimo: aceita client_id URL e devolve eco. */
oauthRouter.post('/register', (req, res) => {
  if (!isPetmiMcpEnabled()) return res.status(503).json({ error: 'mcp_disabled' });
  const clientId =
    typeof req.body?.client_id === 'string' ? req.body.client_id : `petmi-${Date.now()}`;
  const redirectUris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris : [];
  res.status(201).json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
});

/** Inicia OAuth: redireciona para UI de consentimento do Hub. */
oauthRouter.get('/authorize', (req, res) => {
  if (!isPetmiMcpEnabled()) {
    return res.status(503).send('PetMi MCP desabilitado');
  }
  const q = new URLSearchParams();
  for (const key of [
    'response_type',
    'client_id',
    'redirect_uri',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method',
    'resource',
  ]) {
    const v = req.query[key];
    if (typeof v === 'string') q.set(key, v);
  }
  if (q.get('response_type') !== 'code') {
    return res.status(400).send('response_type deve ser code');
  }
  if (!q.get('client_id') || !q.get('redirect_uri') || !q.get('code_challenge')) {
    return res.status(400).send('Parâmetros OAuth incompletos');
  }
  // Preferir UI na API: popup do ChatGPT não passa pela proteção Vercel do Hub.
  const consentBase =
    process.env.PETMI_OAUTH_CONSENT_URL || `${publicApiBase()}/oauth/consent-ui`;
  const dest = `${consentBase}?${q.toString()}`;
  return res.redirect(302, dest);
});

/** Contexto para a página de consentimento (Bearer Supabase). */
oauthRouter.get('/consent/context', authenticateUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { data: memberships, error } = await supabaseAdmin
      .from('clinic_users')
      .select('clinic_id, unit_id, role, status')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) return res.status(500).json({ error: error.message });

    const clinicIds = [...new Set((memberships ?? []).map((m: { clinic_id: string }) => m.clinic_id))];
    const { data: clinics } = await supabaseAdmin
      .from('clinics')
      .select('id, name')
      .in('id', clinicIds.length ? clinicIds : ['00000000-0000-0000-0000-000000000000']);
    const clinicNameById = new Map(
      (clinics ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
    );

    const { data: units } = await supabaseAdmin
      .from('units')
      .select('id, name, clinic_id')
      .in('clinic_id', clinicIds.length ? clinicIds : ['00000000-0000-0000-0000-000000000000']);

    return res.json({
      scopes_supported: [...MCP_SCOPES],
      memberships: (memberships ?? []).map((m: { clinic_id: string; unit_id: string | null; role: string }) => ({
        ...m,
        clinics: { id: m.clinic_id, name: clinicNameById.get(m.clinic_id) || m.clinic_id },
      })),
      units: units ?? [],
    });
  } catch (e: unknown) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

/** Usuário autoriza: cria connection + auth code e devolve redirect. */
oauthRouter.post('/consent/approve', authenticateUser, async (req, res) => {
  try {
    if (!isPetmiMcpEnabled()) return res.status(503).json({ error: 'mcp_disabled' });
    const userId = req.user!.id;
    const {
      clinic_id,
      unit_id,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      resource,
    } = req.body ?? {};

    if (!clinic_id || !unit_id || !client_id || !redirect_uri || !code_challenge) {
      return res.status(400).json({ error: 'Parâmetros incompletos' });
    }

    const active = await assertClinicUserActive(userId, clinic_id);
    if (!active) return res.status(403).json({ error: 'Sem acesso a esta clínica' });

    const { data: unitRow } = await supabaseAdmin
      .from('units')
      .select('id')
      .eq('id', unit_id)
      .eq('clinic_id', clinic_id)
      .maybeSingle();
    if (!unitRow) return res.status(400).json({ error: 'Unidade inválida para a clínica' });

    const scopes = parseScopes(typeof scope === 'string' ? scope : undefined);
    const connection = await createConnection({
      userId,
      clinicId: clinic_id,
      unitId: unit_id,
      scopes,
    });
    const code = await issueAuthCode({
      userId,
      clinicId: clinic_id,
      unitId: unit_id,
      scopes,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'S256',
      resource: resource ?? null,
      connectionId: connection.id,
    });

    const redirect = new URL(redirect_uri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', String(state));
    return res.json({ redirect_uri: redirect.toString(), connection_id: connection.id });
  } catch (e: unknown) {
    console.error('[oauth] consent approve', e);
    return res.status(500).json({ error: (e as Error).message });
  }
});

oauthRouter.post('/token', async (req, res) => {
  try {
    if (!isPetmiMcpEnabled()) return res.status(503).json({ error: 'mcp_disabled' });
    const grantType = String(req.body?.grant_type || '');
    if (grantType === 'authorization_code') {
      const result = await exchangeAuthCode({
        code: String(req.body.code || ''),
        redirectUri: String(req.body.redirect_uri || ''),
        clientId: String(req.body.client_id || ''),
        codeVerifier: String(req.body.code_verifier || ''),
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.json({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        scope: result.scopes.join(' '),
      });
    }
    if (grantType === 'refresh_token') {
      const result = await refreshAccessToken({
        refreshToken: String(req.body.refresh_token || ''),
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.json({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        scope: result.scopes.join(' '),
      });
    }
    return res.status(400).json({ error: 'unsupported_grant_type' });
  } catch (e: unknown) {
    console.error('[oauth] token', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

oauthRouter.get('/connections', authenticateUser, async (req, res) => {
  try {
    const rows = await listConnectionsForUser(req.user!.id);
    return res.json({ connections: rows });
  } catch (e: unknown) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

oauthRouter.post('/connections/:id/revoke', authenticateUser, async (req, res) => {
  try {
    const ok = await revokeConnection({ connectionId: req.params.id, userId: req.user!.id });
    if (!ok) return res.status(404).json({ error: 'Conexão não encontrada' });
    return res.json({ ok: true });
  } catch (e: unknown) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

/** Troca a unidade da conexão (mesma clínica). Tokens emitidos antes continuam com unit antiga até refresh. */
oauthRouter.patch('/connections/:id/unit', authenticateUser, async (req, res) => {
  try {
    const unitId = String(req.body?.unit_id || '');
    if (!unitId) return res.status(400).json({ error: 'unit_id obrigatório' });

    const { data: conn, error } = await supabaseAdmin
      .from('hub_assistant_connections')
      .select('id, clinic_id, user_id, status')
      .eq('id', req.params.id)
      .eq('user_id', req.user!.id)
      .eq('status', 'active')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!conn) return res.status(404).json({ error: 'Conexão não encontrada' });

    const { data: unitRow } = await supabaseAdmin
      .from('units')
      .select('id')
      .eq('id', unitId)
      .eq('clinic_id', conn.clinic_id)
      .maybeSingle();
    if (!unitRow) return res.status(400).json({ error: 'Unidade inválida para esta clínica' });

    const { error: upErr } = await supabaseAdmin
      .from('hub_assistant_connections')
      .update({ unit_id: unitId, updated_at: new Date().toISOString() })
      .eq('id', conn.id);
    if (upErr) return res.status(500).json({ error: upErr.message });

    return res.json({ ok: true, unit_id: unitId });
  } catch (e: unknown) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

export { oauthRouter, resourceMetadataUrl, authorizationServerUrl };
