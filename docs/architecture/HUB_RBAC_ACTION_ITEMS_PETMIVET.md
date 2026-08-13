# Action items — RBAC PetMiVet (quando o app voltar ao roadmap)

Este documento lista pendências de autorização e navegação no **PetMiVet** (`frontend/`), identificadas durante a implementação do RBAC do **PetMi Hub**. O Vet app não está em produção; trate estes itens como backlog de arquitetura.

Referências no Hub (já implementadas):

- `backend/src/utils/permissions.ts` — mapa canônico de papéis e permissões
- `packages/web-core/src/permissions.ts` — espelho usado pelo Hub
- `backend/src/utils/operationalAreas.ts` — áreas operacionais (`recepcao`, `caixa`, …)
- [PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md) — convenção de namespaces

---

## 1. Sincronizar mapa de permissões do frontend

**Problema:** `frontend/src/utils/permissions.ts` está desatualizado em relação ao backend/web-core.

**Faltam hoje (exemplos):**

- Papéis `CGROOMER` e `CFINANCE`
- Permissões de grooming (`grooming.queue.*`), hotel/creche (`boarding.*`), leva e traz (`pickup.*`)
- Permissões financeiras do Hub (`hub.financial.*`, `hub.cash.*`, `hub.receivables.create`)
- Funções `hasEffectivePermission` / `mergePermissionsForRoleAndAreas` e módulo de áreas operacionais

**Ação:**

1. Substituir ou reexportar de um pacote compartilhado (`@petimi/web-core` ou pacote `permissions` dedicado).
2. Garantir que login/sessão do Vet persista `operational_areas` em `clinic_user` (mesmo contrato do Hub).
3. Atualizar middleware/guards do backend Vet (se houver duplicata local) para usar `hasEffectivePermission`.

---

## 2. Migrar namespaces legados (`demand.*`, `application.*`, `marketplace.*`)

**Problema:** permissões de vet-match e marketplace ainda usam prefixos antigos no mapa estático.

**Ação (ver [PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md)):**

- `demand.*` → `vet_match.demands.*`
- `application.*` → `vet_match.applications.*`
- `marketplace.*` → `marketplace.*` (manter produto, padronizar ações)

Incluir período de compatibilidade (aliases) se rotas/controllers do Vet ainda checarem strings antigas.

---

## 3. Áreas operacionais no Vet

**Contexto:** No Hub, cada funcionário tem **papel de governança** + **áreas operacionais** (`operational_areas text[]`), combinadas na autorização.

**Ação (se o Vet tiver staff operacional ou telas compartilhadas):**

1. Reutilizar catálogo em `operationalAreas.ts` (backend + web-core).
2. Expor edição de áreas na UI de equipe do Vet (ou consumir API Hub se unificado).
3. Atualizar `checkPermission` / hooks de permissão para `role + operational_areas`.

---

## 4. Sidebar e rotas filtradas por permissão

**Problema:** No Vet, `sidebarMenuService.tsx` (e rotas protegidas) podem exibir módulos sem checagem mínima de permissão — mesmo gap que existia no `HubSidebar` antes da Fase 4.

**Ação:**

1. Mapear cada item de menu → permissão mínima (`hub.*`, `vet_match.*`, etc.).
2. Esconder seções vazias quando nenhum item é visível.
3. Alinhar com `HubProtectedRoute` / guards de página (não confiar só no menu).

---

## 5. Entitlements por módulo contratado

**Problema:** menu e rotas podem aparecer mesmo sem o módulo contratado pela clínica.

**Ação:**

1. Antes de `hasPermission`, checar entitlements (`module.vet_match`, `module.marketplace`, …).
2. Documentar matriz **entitlement × permissão × papel** em doc de produto.
3. Backend: retornar entitlements na sessão/contexto da clínica.

---

## 6. Whitelists por nome de papel (anti-padrão)

**Lição do Hub:** páginas com `allowedClinicRoles.includes('CASSISTANT')` bloqueavam papéis que já tinham permissão no backend e quebrariam com rename de papel.

**Ação no Vet:**

1. Auditar `allowedRoles`, `allowedClinicRoles`, comparações literais de `CADMIN`/`CMANAGER`/etc. nas páginas.
2. Substituir por `hasPermission('recurso.acao')` ou `hasEffectivePermission`.
3. Adicionar teste de regressão ou lint rule para proibir novos whitelists por string de papel.

---

## 7. Testes e observabilidade

**Ação:**

1. Testes unitários para `hasEffectivePermission` com combinações papel + área (espelhar `backend/src/utils/__tests__/permissions.test.ts`).
2. Testes E2E de login por papel (CADMIN, CASSISTANT, CGROOMER, CFINANCE) validando menu visível e HTTP 403 em rotas sem permissão.
3. Log estruturado em negações 403 (`role`, `operational_areas`, `permission` solicitada) — sem dados sensíveis.

---

## Ordem sugerida de execução

| Prioridade | Item | Motivo |
|------------|------|--------|
| P0 | §1 Sincronizar permissions.ts | Base para todo o resto |
| P0 | §6 Eliminar whitelists por papel | Evita regressões de acesso |
| P1 | §4 Sidebar por permissão | UX e segurança percebida |
| P1 | §3 Áreas operacionais | Paridade com Hub se staff compartilhado |
| P2 | §2 Namespaces vet_match | Dívida técnica de nomenclatura |
| P2 | §5 Entitlements | Comercial / multi-módulo |
| P3 | §7 Testes E2E | Após mapa estável |

---

## Fora de escopo (Hub já tratado)

- Recepção com permissões de caixa no papel `CASSISTANT`
- Remoção de `allowedClinicRoles` nas páginas do `packages/hub-ui`
- Migration `081_alter_operational_areas.sql`
- `HubSidebar` filtrado por `hasPermission`
- Landing `CGROOMER` → `/hub/banho-tosa`
