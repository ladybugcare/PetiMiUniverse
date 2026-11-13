# PetMi Hub — Staging, backups e restore (Fase 0)

Runbook operacional. **Não** substitui o painel Supabase/Railway/Vercel.

## Princípios

1. Staging usa **projeto Supabase separado** do de produção (URL distinta).
2. QA e seeds do Hub rodam **somente** em staging.
3. Restore drill restaura para staging — **nunca** sobrescrever produção sem plano de incidente aprovado.
4. Variáveis `VITE_*` / `SUPABASE_*` de staging nunca apontam para o projeto de produção.

## Git — fluxo sem mismatch (obrigatório)

Trabalhe **só na branch `staging`**. `main` = produção. Sem PR obrigatório.

```bash
./scripts/hub-git-staging.sh start    # entra em staging
# ... codar, commit ...
./scripts/hub-git-staging.sh push     # sobe → hub-staging.petmi.app
# validar no browser / smoke
./scripts/hub-git-staging.sh promote  # só depois: staging → main (fast-forward)
./scripts/hub-git-staging.sh status    # conferir alinhamento
```

| Evite | Faça |
|-------|------|
| Codar / commitar em `main` no dia a dia | Codar em `staging` |
| Commit em `staging` + outro diferente em `main` | Um caminho linear: staging depois promote |
| `push --force` em `main` ou `staging` | Se divergir, pare e alinhe |
| Subir para `main` sem testar staging | `push` → validar → `promote` |

Hub staging: https://hub-staging.petmi.app · API: Railway environment `staging`.

## Ambientes

| Ambiente | Hub web (Vercel) | API | Supabase |
|----------|------------------|-----|----------|
| Local | `apps/hub-web` (Vite) | `backend` localhost | Staging ou projeto pessoal |
| Staging | Projeto **`petmi-hub`** (preview/branch `staging` ou domínio dedicado do Hub) | Serviço dedicado (Railway) | Projeto **staging** |
| Produção | Projeto **`petmi-hub`** → `https://hub.petmi.app` | `https://api.petmi.app` (Railway) | Projeto **produção** |

### Vercel — projeto correto (Hub)

Use o projeto **`petmi-hub`**, root directory `apps/hub-web` (ver [apps/hub-web/README.md](../../apps/hub-web/README.md)).

**Não** use o projeto legado do Vet (`peti-vet` / `staging.petivet.com.br` / `peti-vet-*-petivet.vercel.app`). Esse fluxo está em docs antigas do Shift e **não** é o staging do Hub.

CORS / `HUB_WEB_URL` / redirect Auth devem usar a origem do **`petmi-hub`**, não a do Vet.

## Setup staging (checklist)

1. Criar projeto Supabase staging.
2. Aplicar migrations `backend/database_migrations/petimi_hub/` nesse projeto.
3. Configurar API staging:
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` = staging
   - `HUB_WEB_URL` = origem do Hub no projeto Vercel **`petmi-hub`** (staging)
   - Incluir essa origem em CORS / `PRODUCTION_ORIGINS` ou `STAGING_ORIGINS` da API
   - `NODE_ENV=staging` (ou production + `SENTRY_ENVIRONMENT=staging`)
4. Configurar Hub web no Vercel **`petmi-hub`** (staging/preview):
   - Root Directory: `apps/hub-web`
   - `VITE_API_URL` = API staging
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` = staging
5. Auth Supabase → Authentication → URL Configuration:
   - Site URL = origem do Hub staging (`petmi-hub`)
   - Redirect URLs: `{HUB_ORIGIN}/login`, `{HUB_ORIGIN}/email-confirmed`, `{HUB_ORIGIN}/forgot-password`, `{HUB_ORIGIN}/reset-password`
   - Produção: `https://hub.petmi.app/...` (reset de senha é **nativo no Hub**, não no Vet)
6. Seed mínimo QA: 2 clínicas, roles da matriz em [HUB_MVP_MANUAL_QA.md](./HUB_MVP_MANUAL_QA.md), ≥1 unidade extra na clínica A.
7. Confirmar: login Hub staging **não** lista dados do projeto de produção.

## Seed QA sugerido

Após onboarding manual de duas clínicas (ou scripts existentes em `backend/scripts/`):

| Entidade | Clínica A | Clínica B |
|-----------|-----------|-----------|
| CADMIN / CMANAGER / CASSISTANT / CVET_INTERNAL / CFINANCE | sim | CADMIN mínimo |
| Unidades | A1 + A2 | B1 |
| Catálogo | bootstrap serviços | bootstrap mínimo |

Marcar nomes com prefixo `QA STAGING …` para limpeza.

## Backups (produção)

No painel Supabase do projeto de **produção**:

- [ ] Backup automático diário ativo
- [ ] PITR habilitado se o plano permitir
- [ ] Retenção documentada (dias)

Ver também [PRODUCTION_HARDENING.md](../../backend/docs/PRODUCTION_HARDENING.md).

## Restore drill (obrigatório antes do lançamento)

Objetivo: provar que dá para recuperar dados **sem** tocar a produção ao vivo.

1. Escolher snapshot ou ponto PITR recente de **produção** (somente leitura do backup).
2. Restaurar **para o projeto staging** (ou projeto temporário de drill), nunca in-place em prod neste drill.
3. Atualizar temporariamente API staging para o DB restaurado **ou** validar no projeto de drill.
4. Smoke: login CADMIN, listar guardians/pets, abrir uma comanda, `GET /health/live`.
5. Registrar data, responsável, snapshot usado e resultado em issue/PR interno.
6. Devolver staging ao DB staging “limpo” após o drill.

**Aceite:** checklist assinado com data; Hub utilizável pós-restore.

## Política: sem QA em produção

- Proibido criar dados `QA TESTE` em produção para validar features.
- Bypass de rate-limit (`RATE_LIMIT_BYPASS_USER_IDS`) só para incidentes controlados, não para desenvolvimento cotidiano.
- Matriz multi-tenant e soft-lock: executar em staging (ver script `scripts/hub-tenant-isolation-smoke.ts`).

## Smoke de isolamento

```bash
# Com API staging + tokens de Clínica A e B
cd backend
HUB_SMOKE_BASE_URL=https://api-staging.exemplo \
HUB_SMOKE_TOKEN_A=... \
HUB_SMOKE_TOKEN_B=... \
HUB_SMOKE_CLINIC_A=... \
HUB_SMOKE_CLINIC_B=... \
HUB_SMOKE_GUARDIAN_A=... \
npx tsx scripts/hub-tenant-isolation-smoke.ts
```

Esperado: Clínica B **não** recebe payload da Clínica A (403/404).

## Gate Fase 0 (resumo)

- [ ] Staging desacoplado de produção
- [ ] Restore drill executado
- [ ] Smoke isolamento OK
- [ ] Soft-lock / reset senha / Sentry validados em staging
