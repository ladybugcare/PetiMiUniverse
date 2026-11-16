# Checklist — Gate Fase 0 (Segurança e Estabilidade)

Marque após validar em **staging**. Fonte: auditoria de lançamento + [HUB_STAGING_AND_BACKUP_RUNBOOK.md](./HUB_STAGING_AND_BACKUP_RUNBOOK.md).

**Ambientes (2026-11-13):**

| Camada | Staging | Produção |
|--------|---------|----------|
| Hub | https://hub-staging.petmi.app (`petmi-hub` / branch `staging`) | https://hub.petmi.app |
| API | https://backend-staging-334260f3.up.railway.app | https://api.petmi.app |
| Supabase | PetMi Preprod (`afstcbhcbrkvbihtjbww`) | PetiMiUniverse (`jmfvoabsjxjjrxuzhxzh`) |

## Infra

- [x] Projeto Supabase staging distinto do de produção (PetMi Preprod)
- [x] API + Hub web staging apontam só para staging
- [x] Seed QA: 2 clínicas + roles da matriz (`npm run seed:fase0-qa-staging` → ver `backend/scripts/seed-fase0-qa-staging.ts`)
- [ ] Backup/PITR de produção — **não confirmado**. Plano Free em 2026-11-13. Upgrade para **Pro** planejado para fim de novembro / início de dezembro de 2026; PITR continua decisão à parte. Ver [HUB_BACKUP_INCIDENT_RUNBOOK.md](./HUB_BACKUP_INCIDENT_RUNBOOK.md)
- [ ] Restore drill de dados — **pendente**. Schema do Preprod exportado (22,4 s, 151 tabelas) e arquivo apagado. Linhas e Storage não restaurados. Destino proibido: produção e Preprod
- [x] Política: QA Hub **proibido** em produção (`HUB_MVP_MANUAL_QA.md`)

### Credenciais seed QA (Preprod)

- Senha: variável `QA_STAGING_PASSWORD` em `backend/.env.smoke.preprod.local` (gitignored). Não registrar a senha neste documento.
- Clínica A CADMIN: `qa.staging.a.cadmin@petmi.test` (+ CMANAGER / CASSISTANT / CVET / CFINANCE)
- Clínica B CADMIN: `qa.staging.b.cadmin@petmi.test`
- Smoke vars: `backend/.env.smoke.preprod.local` (gitignored)

## Isolamento multi-tenant

- [x] Smoke tutores A↔B `hub-tenant-isolation-smoke.ts` PASS em staging (2026-11-13)
- [x] Smoke ampliado (listas multi-módulo + RBAC amostrado + FK cruzada) PASS em staging (2026-11-16) — 27 checks. Ver [HUB_FASE0_TENANT_ISOLATION_AUDIT.md](./HUB_FASE0_TENANT_ISOLATION_AUDIT.md)
- [ ] Matriz amostrada UI: CADMIN, CASSISTANT, CVET_INTERNAL, CFINANCE (acessos esperados)
- [x] Correções H1–H6 + `hub.staff.roles.assign` (CADMIN) — código + deploy staging + smoke PASS (2026-11-16)

## Soft-lock / assinatura

> **Bloqueio:** o fix de soft-lock (`hubEntitlements` + middlewares) e reset nativo Hub ainda estão **só no working tree local** — não estão no deploy `staging`/`main`. Validar estes itens **depois** de merge + redeploy Railway staging + Vercel staging.

- [ ] `soft_lock`: ops do dia OK (ex.: pagamento PIX, avanço banho); catálogo estoque/serviços **403**
- [ ] `read_history` / `canceled`: leitura OK; writes mutantes **403**
- [ ] Clínica `full`: criar item de estoque + agendar + pagamento OK
- [ ] Banner de assinatura coerente (`HubSubscriptionBanner`)

## Reset de senha

- [x] Código Hub nativo: `/forgot-password` → `resetPasswordForEmail(redirectTo=origin/reset-password)` → `/reset-password` → login (sem Vet); `HubAuthListener` redireciona hash `type=recovery`; senha mínima alinhada ao signup (≥8)
- [x] E2E Playwright com **mocks** Auth (`apps/hub-web/e2e/auth.reset-password.spec.ts` + smoke público) — PASS local
- [ ] Deploy branch `staging` + validação real no browser (e-mail QA Preprod → nova senha → login)
- [ ] Redirect URLs no Supabase **Preprod** confirmadas no Dashboard (Site URL `https://hub-staging.petmi.app` + `/**` / `/reset-password`) — **não inspecionável via MCP/API pública**; verificar manualmente
- [ ] Produção (`PetiMiUniverse`): redirects Hub — **fora deste gate de staging**; não alterar sem aprovação

### Deployment Protection (Vercel `petmi-hub`)

- Evidência (2026-11-13): `ssoProtection.enabled=true`, `deploymentType=all_except_custom_domains`, domínio `hub-staging.petmi.app` (branch `staging`).
- Na prática, `GET https://hub-staging.petmi.app/forgot-password` **sem** sessão Vercel → **302 SSO** (`vercel.com/sso-api`). Produção `hub.petmi.app` responde 200 sem SSO.
- QA do reset: autenticar no time Vercel no browser **antes** de abrir o link do e-mail; abrir forgot apenas em `https://hub-staging.petmi.app` (não `*.vercel.app`).
- Bypass de automação / share link: só com aprovação; **não** desligar proteção global.

## Observabilidade

- [ ] `SENTRY_DSN` em staging; forçar 500 → evento com `correlationId` (DSN **ainda não** setado no Railway staging)
- [x] Sem DSN: API e Hub sobem normalmente (confirmado health staging)
- [ ] Error boundary do Hub exibe fallback em erro de UI — código local; falta deploy

## Assinatura deste gate

| Campo | Valor |
|-------|--------|
| Data | 2026-11-13 (parcial) |
| Responsável | |
| Ambiente staging URL | https://hub-staging.petmi.app |
| Resultado | **IN PROGRESS** — infra + seed + smoke tutores OK. Auditoria isolamento/RBAC concluída com **gaps High** (FK clínicos, leitos, crédito, boarding create, escalação CMANAGER). Backup: **PROTEÇÃO INSUFICIENTE** (plano Free). Soft-lock/Sentry ainda pendentes |

## Próximos passos imediatos

1. Remediação isolamento (§5 de [HUB_FASE0_TENANT_ISOLATION_AUDIT.md](./HUB_FASE0_TENANT_ISOLATION_AUDIT.md)): asserts de pet/guardian/unit + `clinic_id` em leitos + anti-promoção de role.
2. Re-seed staging + `npm run smoke:tenant-isolation` (smoke ampliado).
3. Commit/PR das mudanças Fase 0 (soft-lock, reset senha, Sentry hub-web, auditoria) → merge em `staging` (e depois `main`).
4. Redeploy Railway `staging` + Vercel branch `staging`; revalidar soft-lock + forgot/reset + error boundary.
5. Configurar `SENTRY_DSN` (staging) e testar evento.
6. Backup: upgrade Pro na janela fim de novembro / início de dezembro de 2026. Detalhe em [HUB_BACKUP_INCIDENT_RUNBOOK.md](./HUB_BACKUP_INCIDENT_RUNBOOK.md).
