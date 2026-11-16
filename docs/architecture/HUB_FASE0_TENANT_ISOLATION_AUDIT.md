# Auditoria Fase 0 — Isolamento multi-tenant e permissões (PetMi Hub)

**Data:** 2026-11-13  
**Escopo:** API Hub (`/api/hub` + `/api/public`) com Express + Supabase `service_role`  
**Ambiente de referência:** staging / Preprod  
**Backup/PITR:** fora deste documento (pendente upgrade Pro)

## Modelo de ameaça

| Camada | Papel |
|--------|--------|
| JWT Supabase | Identidade do usuário |
| `clinic_users` + `requirePermission` | Membership na clínica + RBAC |
| Controllers (`.eq('clinic_id')` / asserts) | Isolamento de dados |
| RLS Postgres | **Bypassado** pelo `service_role` — defesa em profundidade apenas |

O cliente envia `clinic_id` (query/body/params). Sem membership ativa → **403**. Isolamento real depende de o controller filtrar/afirmar `clinic_id` em toda leitura e mutação.

Atacante típico: staff autenticado da clínica A com JWT válido, tentando IDs da clínica B (ou `clinic_id` de B).

---

## 1. Status por módulo

Legenda: **OK** leitura/escrita escopadas · **GAP** falha concreta · **PARCIAL** list/get OK, create/FK frágil

| Módulo | Status | Notas |
|--------|--------|--------|
| Tutores (`hub_guardians`) | OK | get/list/patch com `clinic_id`; smoke staging PASS |
| Pets | OK | list/create/patch escopados; asserts de guardian |
| Agenda | OK | `assertPet/Guardian/Staff/UnitInClinic` no create/patch |
| Encounters / check-in | OK | create valida pet; get/patch com `clinic_id` |
| Casos clínicos (create explícito) | OK | valida pet |
| Prescrições / vacinas / medicações / anexos | **GAP** | create aceita `pet_id` sem assert de clínica |
| Exames / encaminhamentos / timeline notes | **GAP** | mesmo padrão de FK cruzada |
| Internações | **GAP** | create sem assert pet/guardian/unit; update de leito só por `id` |
| Cirurgias / leitos (CRUD leito) | PARCIAL | create de leito com `clinic_id`; mutação de status em hospitalização sem `clinic_id` no WHERE |
| Banho e Tosa | OK | `assertPetInClinic`; sessions com `clinic_id` |
| Hotel/Creche (via appointment) | OK | appointment validado |
| Hotel/Creche (create direto) | **GAP** | `pet_id`/`guardian_id`/`unit_id` sem assert |
| Leva e Traz | OK | routes/stops com `clinic_id` |
| Comandas | OK | carga e mutações com `clinic_id` |
| Pagamentos / recebíveis / caixa | OK | asserts de payment/session; reverse cross-tenant coberto em teste |
| Crédito do tutor | **GAP** | `guardian_id` sem assert |
| Estoque | OK | item/lot assertados |
| Equipe | OK* | staff filtrado; *escalação de role CMANAGER→CADMIN |
| Relatórios / day-ops | OK | filtram `clinic_id` |
| Storage clínico / staff photos | OK | path + auth |
| Storage boarding media | PARCIAL | reserva assertada; `task_id`/`incident_id` fracos; bucket público |
| Endpoints públicos (token) | PARCIAL | tokens longos OK; códigos curtos RX enumeráveis com rate limit; alguns routers sem limiter dedicado |

---

## 2. Achados (IDOR / isolamento)

### Alta

| ID | Local | Problema | Impacto |
|----|-------|----------|---------|
| H1 | `hubClinicalModulesController.ts` — create prescription / vaccination / medication / attachments | `pet_id` gravado sem `assertPetInClinic` | Registro clínico na clínica A com pet de B; joins vazam nome/dados do pet B |
| H2 | `hubClinicalExamsController.ts`, `hubSpecialistReferralsController.ts`, `hubClinicalTimelineController.ts` | Idem | Poluição + vazamento via joins/export |
| H3 | `createHubHospitalization` + `createAutoCase` | pet/guardian/unit sem assert | Internação/caso cruzado; vazamento em selects enriquecidos |
| H4 | Updates `hub_hospital_beds` (~1398, ~1631–1641) | `.update({ status }).eq('id', …)` **sem** `.eq('clinic_id')` | Com UUID de leito B, alterar status (ocupado/livre) na outra clínica |
| H5 | `hubCustomerCreditController.ts` | Movimento/saldo com `guardian_id` sem assert | Crédito sob clínica A apontando tutor B |
| H6 | `createHubBoardingReservation` | pet/guardian/unit do body sem assert | Reserva na A ligada a entidades da B |

### Média

| ID | Local | Problema |
|----|-------|----------|
| M1 | Quotes / hospitalização `unit_id` | `unit_id` sem `assertUnitInClinic` (agenda já valida) |
| M2 | `hubBoardingRecordsController` upload | `task_id`/`incident_id` sem amarrar à reserva |
| M3 | Bucket `hub-boarding-media` público | URL conhecida → leitura sem auth |
| M4 | Códigos públicos `RX-XXXX-XXXX` + `/validate` | Enumeração teórica (mitigado por rate limit) |
| M5 | Alguns `/api/public/*` | Sem limiter dedicado (só general) |

### Baixa

| ID | Local | Problema |
|----|-------|----------|
| L1 | Updates pós-check só por `id` | Defense-in-depth fraca (TOCTOU teórico) |
| L2 | Enrichment joins pet/guardian sem `clinic_id` | Amplifica H1–H6 se FK suja existir |

---

## 3. Permissões por função (perfis QA)

Fonte: `backend/src/utils/permissions.ts` + `operationalAreas.ts`. Seed: `npm run seed:fase0-qa-staging` (sem `operational_areas` — testa papel base).

| Módulo | CADMIN | CASSISTANT | CVET_INTERNAL | CFINANCE |
|--------|--------|------------|---------------|----------|
| Tutores/Pets | R/W | R | —* | R |
| Agenda | R/W | R/W | R | R |
| Clínica / prontuário | R/W | — | R/W | — |
| Financeiro write / reverse / adjust | sim | — | — | sim |
| Caixa abrir/fechar | sim | sim | — | **não** |
| Receber / gerar cobrança | sim | sim | — | sim |
| Equipe write / invite | sim | — | — | — |
| Estoque | R/W | R | R | R/W |
| B&T / Hotel / Leva-traz | pleno | parcial† | — | R |

\* Vet ganha guardians/pets **read** só com área `clinica`.  
† Recepção: boarding/pickup manage; grooming só read.

### Escalação e isolamento de papel

| Achado | Severidade | Detalhe |
|--------|------------|---------|
| CMANAGER (ou área `equipe`) pode PATCH do próprio `hub_access_role` → CADMIN | **Alta (privilégio)** | Guard em `hubStaffController` só impede CADMIN de se rebaixar; não impede promoção |
| Cross-clinic com `clinic_id` alheio | Mitigado | `requirePermission` → 403 se não for membro |
| Cross-unit | Por design fraco | Autorização é por clínica; `unit_id` é filtro de UI/API opcional, não hard-RBAC |
| Drift `packages/web-core` vs backend | Média (UI) | CFINANCE: web-core tem `cash.session` e falta reverse/adjust; API é a fonte da verdade |

---

## 4. Cobertura de testes

| Camada | O que cobre | Lacuna |
|--------|-------------|--------|
| Smoke `hub-tenant-isolation-smoke.ts` | Tutores A↔B + listas multi-módulo (ampliado 2026-11-13) | Creates clínicos com FK cruzada ainda não exercitados em staging |
| Integração financeiro | Reverse payment cross-tenant → 404 | Demais IDs |
| `permissions.test.ts` | Mapa estático de papéis | Escalação staff PATCH |
| Matriz UI QA (4 perfis) | Checklist Fase 0 | Ainda pendente de execução manual |

---

## 5. Remediação recomendada (ordem)

1. Extrair helpers compartilhados `assertPetInClinic` / `assertGuardianInClinic` / `assertUnitInClinic` (padrão já existe em appointments/encounters/grooming).
2. Aplicar nos creates: clínico (H1–H3), boarding (H6), crédito (H5), quotes `unit_id` (M1).
3. Toda mutação de `hub_hospital_beds` com `.eq('clinic_id', clinicId)` (H4).
4. Bloquear promoção de role: só CADMIN atribui CADMIN; ninguém promove a si mesmo para papel superior.
5. Alinhar `packages/web-core` permissions ao backend; validar `task_id`/`incident_id` no upload boarding; rate limit dedicado em `/api/public`.
6. Ampliar smoke/staging: create prescription A com `pet_id` B → 400; patch bed B a partir de A → 404/400.

---

## 6. Veredito do gate (isolamento + permissões)

| Critério | Resultado |
|----------|-----------|
| Isolamento de **leitura** por `clinic_id` (membership) | **PASS** nos módulos amostrados (middleware + filtros) |
| Isolamento de **get-by-id** tutores/pets/agenda/finance/comandas | **PASS** (padrão id+clinic_id) |
| Isolamento de **writes** com FKs (`pet_id`, leitos, crédito, boarding create) | **FAIL parcial** — gaps H1–H6 |
| RBAC papel base (recepção/vet/financeiro) | **PASS** no mapa de permissões; UI matrix ainda pendente |
| Anti-escalação de privilégio | **FAIL** — CMANAGER→CADMIN via staff PATCH |
| Smoke staging guardians | **PASS** (2026-11-13); smoke ampliado pronto para reexecução pós-seed |

**Conclusão (atualizada 2026-11-16):** H1–H6 e escalação staff corrigidos (`hubTenantAsserts` + `hub.staff.roles.assign`). Deploy Railway staging SUCCESS + smoke ampliado **PASS (27 checks)** incluindo FK cruzada e RBAC amostrado. Isolamento multi-tenant: **PARCIALMENTE VALIDADO** — P0 fechados; residuais M2–M5, matriz UI manual e backup Pro fora deste escopo. Sem **BLOQUEADORES P0** conhecidos nos itens H1–H6/staff.
