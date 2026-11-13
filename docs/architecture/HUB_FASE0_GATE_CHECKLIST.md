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
- [ ] Backup/PITR prod confirmado no painel
- [ ] Restore drill executado (backup → staging/drill) e documentado
- [x] Política: QA Hub **proibido** em produção (`HUB_MVP_MANUAL_QA.md`)

### Credenciais seed QA (Preprod)

- Senha padrão: `QaStaging!2026` (ou `QA_STAGING_PASSWORD`)
- Clínica A CADMIN: `qa.staging.a.cadmin@petmi.test` (+ CMANAGER / CASSISTANT / CVET / CFINANCE)
- Clínica B CADMIN: `qa.staging.b.cadmin@petmi.test`
- Smoke vars: `backend/.env.smoke.preprod.local` (gitignored)

## Isolamento multi-tenant

- [x] Smoke `npx tsx scripts/hub-tenant-isolation-smoke.ts` PASS em staging (2026-11-13)
- [ ] Matriz amostrada UI: CADMIN, CASSISTANT, CVET_INTERNAL, CFINANCE (acessos esperados)

## Soft-lock / assinatura

> **Bloqueio:** o fix de soft-lock (`hubEntitlements` + middlewares) e reset nativo Hub ainda estão **só no working tree local** — não estão no deploy `staging`/`main`. Validar estes itens **depois** de merge + redeploy Railway staging + Vercel staging.

- [ ] `soft_lock`: ops do dia OK (ex.: pagamento PIX, avanço banho); catálogo estoque/serviços **403**
- [ ] `read_history` / `canceled`: leitura OK; writes mutantes **403**
- [ ] Clínica `full`: criar item de estoque + agendar + pagamento OK
- [ ] Banner de assinatura coerente (`HubSubscriptionBanner`)

## Reset de senha

- [ ] `/forgot-password` no Hub (sem depender do Vet) — código local; falta deploy
- [ ] E-mail → `/reset-password` no domínio Hub → login com senha nova
- [ ] Redirect URLs configuradas no Supabase (staging e prod) — Preprod: Site URL `https://hub-staging.petmi.app` + redirects `/**`

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
| Resultado | **IN PROGRESS** — infra + seed + smoke OK; soft-lock/reset/Sentry/restore pendentes |

## Próximos passos imediatos

1. Commit/PR das mudanças Fase 0 (soft-lock, reset senha, Sentry hub-web) → merge em `staging` (e depois `main`).
2. Redeploy Railway `staging` + Vercel branch `staging`.
3. Revalidar soft-lock + forgot/reset + error boundary.
4. Configurar `SENTRY_DSN` (staging) e testar evento.
5. No Supabase **produção**: confirmar backup diário / PITR; executar restore drill → Preprod (ou projeto drill) e registrar resultado.
