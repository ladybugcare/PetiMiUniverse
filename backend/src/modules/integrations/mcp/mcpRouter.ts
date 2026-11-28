import { Router, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { mcpAuthMiddleware, type McpAuthedRequest } from './mcpAuthMiddleware';
import { callMcpTool, listMcpTools, MCP_SERVER_INFO } from './mcpServer';
import { isPetmiMcpEnabled } from '../oauth/connectionService';
import { publicApiBase } from '../oauth/oauthCrypto';

const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PETMI_MCP_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

const mcpRouter = Router();
mcpRouter.use(mcpLimiter);

type JsonRpcReq = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(res: Response, id: string | number | null | undefined, result: unknown) {
  return res.status(200).json({ jsonrpc: '2.0', id: id ?? null, result });
}

function rpcError(
  res: Response,
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return res.status(200).json({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  });
}

function primaryMethod(body: unknown): string | undefined {
  if (Array.isArray(body)) return body[0]?.method;
  if (body && typeof body === 'object') return (body as JsonRpcReq).method;
  return undefined;
}

function requiresAuth(method: string | undefined): boolean {
  if (!method) return true;
  if (method === 'initialize' || method === 'ping') return false;
  if (method.startsWith('notifications/')) return false;
  return true;
}

mcpRouter.post(
  '/',
  (req: McpAuthedRequest, res: Response, next: NextFunction) => {
    if (!isPetmiMcpEnabled()) {
      res.status(503).json({ error: 'PetMi MCP desabilitado' });
      return;
    }
    const method = primaryMethod(req.body);
    if (!requiresAuth(method)) return next();
    return mcpAuthMiddleware(req, res, next);
  },
  async (req: McpAuthedRequest, res: Response) => {
    const body = req.body as JsonRpcReq | JsonRpcReq[];
    const messages = Array.isArray(body) ? body : [body];

    if (messages.length === 1 && messages[0]?.method?.startsWith('notifications/')) {
      return res.status(202).end();
    }

    const msg = messages[0];
    if (!msg?.method) {
      return rpcError(res, null, -32600, 'Invalid Request');
    }

    if (msg.method === 'initialize') {
      return rpcResult(res, msg.id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: MCP_SERVER_INFO.name, version: MCP_SERVER_INFO.version },
        instructions: MCP_SERVER_INFO.instructions,
      });
    }

    if (msg.method === 'ping') {
      return rpcResult(res, msg.id, {});
    }

    if (msg.method === 'tools/list') {
      return rpcResult(res, msg.id, { tools: listMcpTools() });
    }

    if (msg.method === 'tools/call') {
      if (!req.mcpContext) {
        return rpcError(res, msg.id, -32001, 'Unauthorized');
      }
      const name = String(msg.params?.name || '');
      const args = (msg.params?.arguments as unknown) ?? {};
      const toolResult = await callMcpTool({
        name,
        args,
        context: req.mcpContext,
        scopes: req.mcpScopes,
        idempotencyKey:
          (req.headers['idempotency-key'] as string) ||
          (typeof msg.id === 'string' || typeof msg.id === 'number' ? String(msg.id) : null),
      });
      return rpcResult(res, msg.id, toolResult);
    }

    return rpcError(res, msg.id, -32601, `Method not found: ${msg.method}`);
  },
);

mcpRouter.get('/', (_req, res) => {
  if (!isPetmiMcpEnabled()) return res.status(503).json({ error: 'disabled' });
  res.status(405).set('Allow', 'POST').json({
    error: 'Use POST for MCP Streamable HTTP',
    resource_metadata: `${publicApiBase()}/.well-known/oauth-protected-resource`,
  });
});

export default mcpRouter;
