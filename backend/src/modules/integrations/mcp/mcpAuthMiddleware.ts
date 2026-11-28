import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../oauth/oauthCrypto';
import { assertClinicUserActive, isPetmiMcpEnabled } from '../oauth/connectionService';
import { publicApiBase } from '../oauth/oauthCrypto';
import type { ActionContext } from '../../hub/actions/types';

export type McpAuthedRequest = Request & {
  mcpContext?: ActionContext;
  mcpScopes?: string[];
};

export async function mcpAuthMiddleware(
  req: McpAuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isPetmiMcpEnabled()) {
    res.status(503).json({ error: 'PetMi MCP desabilitado' });
    return;
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res
      .status(401)
      .set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${publicApiBase()}/.well-known/oauth-protected-resource", scope="petmi.grooming.read"`,
      )
      .json({ error: 'unauthorized' });
    return;
  }

  const token = auth.slice(7);
  const claims = verifyAccessToken(token);
  if (!claims) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  const { supabaseAdmin } = await import('../../../config/supabase');
  const { data: conn } = await supabaseAdmin
    .from('hub_assistant_connections')
    .select('id, status, clinic_id, unit_id')
    .eq('id', claims.connection_id)
    .maybeSingle();
  if (!conn || conn.status !== 'active') {
    res.status(401).json({ error: 'connection_revoked' });
    return;
  }
  const membership = await assertClinicUserActive(claims.sub, conn.clinic_id as string);
  if (!membership) {
    res.status(401).json({ error: 'user_inactive' });
    return;
  }

  req.mcpContext = {
    userId: claims.sub,
    clinicId: conn.clinic_id as string,
    // Prefer unit atual da conexão (troca de unidade sem re-consent completo).
    unitId: (conn.unit_id as string) || claims.unit_id,
    provider: 'chatgpt',
    correlationId: (req.headers['x-correlation-id'] as string) || null,
    enforceRbac: true,
  };
  req.mcpScopes = claims.scopes;
  next();
}
