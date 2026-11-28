# PetMi Action Engine + ChatGPT MCP — POC

## Visão

Interfaces (Alexa, ChatGPT, futuro voice nativo) chamam a **PetMi Action Engine** com ações estruturadas. NLP fica no assistente; o Hub permanece fonte da verdade.

## Feature flags

| Env | Efeito |
|-----|--------|
| `PETMI_VOICE_ENABLED=true` | Alexa / voice |
| `PETMI_MCP_ENABLED=true` | MCP + OAuth AS |
| `PETMI_OAUTH_JWT_SECRET` | Assinatura dos access tokens MCP |
| `PETMI_PUBLIC_API_URL` | Base HTTPS da API (metadata OAuth/MCP) |
| `PETMI_HUB_WEB_URL` | URL do Hub (consentimento OAuth) |
| `PETMI_ALEXA_ENFORCE_RBAC=true` | Valida `checkPermission` no actor da allowlist Alexa |
| `PETMI_MCP_RATE_LIMIT_MAX` | Req/min no `/mcp` (default 60) |

## Endpoints

- `POST /api/integrations/alexa` — Alexa (inalterado)
- `POST /mcp` — MCP Streamable HTTP (JSON-RPC)
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `/oauth/authorize`, `/oauth/token`, `/oauth/consent/*`, `/oauth/connections`

## Migration

`183_create_hub_assistant_oauth_and_actions.sql` — connections, codes, refresh, confirmations, idempotency.

## Limitações ChatGPT (oficiais)

1. **Writes** custom MCP: ChatGPT **Business / Enterprise / Edu** (web). Pro = read/fetch only. Free/Plus não listados.
2. Conexão custom MCP: **web only** (não mobile para conectar).
3. Ditado: use voz/ditado do ChatGPT no web; POC não depende de mic em widget Apps SDK.
4. Tools ficam “congeladas” no workspace até admin dar refresh.
5. Business/Enterprise: OpenAI não treina com dados de apps por padrão; contas pessoais podem, se “Improve the model” estiver ligado.
6. POC: **somente dados fictícios** para clínica.

## Custos

- PetMi: sem chamada à API paga OpenAI; custo = Railway existente.
- Time POC: ~US$20–25/seat/mês ChatGPT Business (Standard) para writes.

## Segurança

- Tenant/user vêm do token OAuth, nunca dos args do modelo.
- RBAC via `checkPermission` a cada action (MCP).
- Confirmações clínicas: hash canônico + TTL + single-use (`hub_action_confirmations`).
- Revogação: `POST /oauth/connections/:id/revoke` ou UI Hub Integrações.

## Referências

- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/api/docs/guides/custom-mcp-server
