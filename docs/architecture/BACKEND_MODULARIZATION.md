# Modularização do backend — plano incremental

Objetivo: agrupar código por **domínio de negócio** (platform, hub, vetMatch, marketplace, petmiId, admin) mantendo um único deploy (modular monolith).

## Estado atual (resumo)

- `backend/src/app.ts` monta dezenas de routers.
- `controllers/`, `services/`, `routes/` organizados por tipo técnico.
- Alguns agrupamentos por pasta (`controllers/admin/`, `controllers/clinics/`).

---

## Estrutura alvo (incremental)

Opção recomendada — **módulos verticais** convivendo com pastas legadas:

```text
backend/src/
  modules/
    platform/           # auth helpers estendidos, audit, notif infra
    hub/
      routes/
      controllers/
      services/
    vetMatch/
      routes/
      controllers/
      services/
    marketplace/
    petmiId/
    admin/
  legacy/               # opcional: symlink mental para arquivos ainda não movidos
  app.ts                # composição de routers
```

**Regra de import**: `modules/hub` não importa controllers de `modules/vetMatch` exceto via **interface** em `modules/platform/contracts` ou eventos assíncronos.

---

## Fases

### Fase 1 — Router composition apenas

1. Criar `modules/hub/routes/index.ts` que exporta um `Router` vazio ou com health.
2. Em `app.ts`, montar `app.use('/api/hub', hubRouter)` **sem** alterar rotas existentes.
3. Novos endpoints do Hub nascem sob `/api/hub/...`.

### Fase 2 — Mover vertical slices completos

Ordem sugerida:

1. **hub** — novos CRUD guardians, appointments, encounters.
2. **vetMatch** — mover `demands`, `applications`, work proof, invites (quando touch points mapeados).
3. **marketplace** — mover rotas atuais para prefixo consistente `/api/marketplace` (mantendo redirects ou aliases deprecados por um release).

### Fase 3 — Domínio compartilhado

1. Criar `modules/platform/events` (funções tipadas `emitHubEvent`) ou fila futura.
2. Evitar `services/` globais crescentes; cada módulo com seus services.

### Fase 4 — Banco de dados

1. Prefixo de tabelas **opcional** (`hub_appointments`) vs schema Postgres `hub` (se Supabase/plano permitir).
2. Documentar owner da tabela em [PRODUCT_BOUNDARIES.md](./PRODUCT_BOUNDARIES.md).

---

## Convenções de API

| Produto | Prefixo sugerido |
|---------|-------------------|
| Hub | `/api/hub` |
| Vet/Match | `/api/vet-match` ou manter `/demands` com proxy interno |
| Marketplace | `/api/marketplace` |
| PetMi ID | `/api/petmi-id` |
| Admin | `/api/admin` (já parcialmente existente) |

Durante transição, **deprecation headers** ou versão `v1` na doc Swagger.

---

## Testes e qualidade

- Testes de contrato mínimos por módulo (supertest) para rotas novas.
- Lint rule opcional: proibir imports de `modules/vetMatch` em `modules/hub` (eslint boundaries plugin).

---

## Checklist por PR de módulo

- [ ] Router isolado e montado em `app.ts`.
- [ ] Sem dependência circular (extrair DTOs para `types/` ou `contracts/`).
- [ ] Migração SQL referenciada em `backend/database_migrations/README.md` com owner `hub` / `vet_match`.

---

## Alinhamento com frontend

- Client HTTP em `frontend/src/products/hub/api` aponta para `/api/hub`.
- Tipos compartilhados: futuro pacote `packages/contracts`; até lá, duplicar DTOs mínimos ou gerar OpenAPI.
