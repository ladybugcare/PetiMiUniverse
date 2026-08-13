# Endurecimento de produção — API PetMi

Checklist alinhado ao plano de deploy (Railway + Vercel + Supabase). Nada disto substitui revisão de segurança dedicada.

## Rate limiting

- Produção usa limites por utilizador (JWT `sub`) ou IP: **800 req / 15 min** (global) e **2000 req / 15 min** em `/api/hub` autenticado. Ver `GENERAL_RATE_LIMIT_MAX`, `HUB_RATE_LIMIT_MAX` em [RAILWAY.md](../RAILWAY.md).
- **Utilizadores de teste/QA em produção**: definir `RATE_LIMIT_BYPASS_USER_IDS` com UUIDs Supabase (campo `sub` do JWT), separados por vírgula. Não recebem 429; o middleware `rateLimitBypassMonitor` regista aviso nos logs se ultrapassarem `RATE_LIMIT_BYPASS_MONITOR_MAX` (default 5000 / janela).
- O `express-rate-limit` e os limitadores em memória em [middleware/rateLimiter.ts](../src/middleware/rateLimiter.ts) **não partilham estado entre réplicas**.
- **Curto prazo**: uma réplica na Railway ou limites conservadores.
- **Médio prazo**: store distribuído (Redis / Upstash) para `express-rate-limit` e para contadores por utilizador, se escalares horizontalmente.

## Uploads (Multer)

- Validar `PAYLOAD_LIMIT_DEFAULT` e timeouts do serviço na Railway.
- Ficheiros grandes: preferir **Supabase Storage** com URLs assinadas em vez de armazenar no disco do contentor.

## Geração de PDF (pdfkit)

- Operações CPU/memória intensivas: monitorizar memória e tempo de resposta.
- Considerar fila de trabalhos ou timeout HTTP adequado se os PDFs crescerem.

## Supabase service role

- A chave `SUPABASE_SERVICE_ROLE_KEY` deve existir **apenas** nas variáveis do Railway (ou outro backend).
- Nunca em variáveis `VITE_*` / bundle do browser.
- Auditar usos de `supabaseAdmin` vs cliente anon com JWT do utilizador.

## RLS (Row Level Security)

- RLS no Postgres é defesa em profundidade.
- O cliente **service role ignora RLS**: toda a autorização crítica deve permanecer na camada Express (middleware, verificação de unidade/clínica, etc.).

## Logs

- Produção: logs só via **stdout/stderr** ([utils/logger.ts](../src/utils/logger.ts)) para ingestão pela Railway.
- Para pesquisa a longo prazo: agregador externo (Datadog, Axiom, etc.) se necessário.

## Backups

- No painel Supabase: plano com **backups** e, se necessário, **PITR** (point-in-time recovery).
- Testar restore em ambiente de staging antes de depender de PITR em incidente real.

## Health checks

- **Liveness**: `GET /health/live` — sem Supabase (probes rápidos).
- **Readiness / dependências**: `GET /` na API ainda pode reflectir estado da base (comportamento existente); usar para diagnóstico humano ou checks mais profundos, não obrigatoriamente para o mesmo intervalo que o liveness.
