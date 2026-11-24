# PetMi Hub — Loop de desenvolvimento (DevEx)

Página curta para agentes e humanos. Complementa [HUB_STAGING_AND_BACKUP_RUNBOOK.md](./HUB_STAGING_AND_BACKUP_RUNBOOK.md) e [HUB_FASE0_GATE_CHECKLIST.md](./HUB_FASE0_GATE_CHECKLIST.md). Rules Cursor: `hub-dev-loop`, `hub-staging-deploy`, `hub-e2e`.

## Ambientes

| Camada | Staging | Produção (não usar em QA) |
|--------|---------|---------------------------|
| Hub | https://hub-staging.petmi.app | https://hub.petmi.app |
| API | https://backend-staging-334260f3.up.railway.app | https://api.petmi.app |
| Local | Hub `:3002` · API `:3000` + DB preprod | — |

## Fluxo recomendado

```text
1. Fix / produto          → testes unitários ou integração do módulo
2. Smoke E2E direcionado  → npm run test:etapa-a -- -g "T0x"  (Hub/API locais)
3. Push staging           → ./scripts/hub-git-staging.sh push
4. Deploy API por SHA     → ./scripts/hub-staging-api-deploy.sh deploy <sha>
5. Gate                   → regressão completa + checklist Fase 0
6. Promote                → ./scripts/hub-git-staging.sh promote  (só após aceite)
```

Não misturar os passos 1–5 no mesmo prompt/chat longo.

## Comandos

### Git staging

```bash
./scripts/hub-git-staging.sh start
./scripts/hub-git-staging.sh push
./scripts/hub-git-staging.sh status
./scripts/hub-git-staging.sh promote   # só após validar staging
```

### API Railway (SHA)

```bash
# Somente leitura — commit ativo + health
./scripts/hub-staging-api-deploy.sh status
./scripts/hub-staging-api-deploy.sh status <sha>   # confere se o SHA já está ativo

# Deploy (redeploy --commit; NÃO usa railway up)
./scripts/hub-staging-api-deploy.sh deploy <sha>
./scripts/hub-staging-api-deploy.sh wait <sha>     # só poll + health
```

Variáveis opcionais: `HUB_STAGING_API_URL`, `HUB_STAGING_RAILWAY_SERVICE` (default `backend`), `HUB_STAGING_RAILWAY_ENV` (default `staging`), `HUB_STAGING_DEPLOY_TIMEOUT_SEC` (default `600`).

### E2E

```bash
cd apps/hub-web
npm run test:etapa-a -- -g "T02"    # direcionado
npm run test:etapa-a                # gate Etapa A
npm run test:etapa-b                # gate Etapa B
```

Default: Hub/API locais. Helpers: `apps/hub-web/e2e/helpers/etapaA/` (inclui `vercelProtection.ts` — bypass só no Hub). Credenciais: `backend/.env.smoke.preprod.local` / `.env.staging.local` (gitignored). **Proibido** E2E em produção.

Preferir Playwright + helpers a novos `qa_*.cjs`.

## Handoff entre chats

Texto curto (≤15 linhas):

1. Objetivo da fatia  
2. Decisões travadas (1 linha cada)  
3. Branch + SHA  
4. Testes já executados (comando → PASS/FAIL)  
5. Pendências  
6. Fora de escopo  

## Bloqueios — parar e reportar

- Deploy ativo com `commitHash` ≠ SHA pedido  
- Health da API staging falhou no timeout  
- Migrations necessárias não aplicadas no preprod  
- E2E caindo em SSO Vercel sem bypass scoped  
- Working tree sujo quando o ritual Git exige limpo  

Não improvisar `railway up`, desligar proteção Vercel ou apontar para produção.
