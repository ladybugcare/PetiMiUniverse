# PetMi Hub — Fase 1 (Foundation): épicos, ordem e critérios de aceite

Este documento converte a **Fase 1 — Hub Foundation** do roadmap multi-produto em épicos implementáveis. Ordem pensada para **dependências técnicas e valor liberado cedo**.

Referências: [HUB_DOMAIN_MODEL.md](./HUB_DOMAIN_MODEL.md), [HUB_GUARDIAN_CRM_VISION.md](./HUB_GUARDIAN_CRM_VISION.md), [PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md), [FRONTEND_MODULARIZATION.md](./FRONTEND_MODULARIZATION.md), [BACKEND_MODULARIZATION.md](./BACKEND_MODULARIZATION.md), [HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md](./HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md) (cadastro Hub — backlog), [HUB_QUOTES_AND_PROSPECTS.md](./HUB_QUOTES_AND_PROSPECTS.md) (orçamentos — backlog).

---

## Legenda

- **Deps**: épicos pré-requisitos.
- **Aceite**: critérios testáveis/manuais mínimos.

---

## Epic 0 — Preparação de repositório e boundaries

**Objetivo**: preparar o solo sem mudar comportamento do PetMi Vet.

**Entregas**

1. Pasta `docs/architecture/` (já criada) como fonte de verdade.
2. Esqueleto de código (opcional neste epic, pode ser Epic 1):
   - `frontend/src/products/hub/` com `README.md`.
   - `backend/src/modules/hub/routes/index.ts` montado em `app.ts` como `/api/hub/health`.
3. **Branding Hub** (antes ou junto da primeira UI Hub): documentar e preparar tokens e assets segundo [HUB_BRANDING.md](./HUB_BRANDING.md) — logo Hub, paleta própria (não o `colors.brand` do PetMi Vet), e local do arquivo `hubTheme.ts` quando a implementação começar.

**Deps**: nenhum.

**Aceite**

- [ ] Documentação linkada a partir do README raiz do repo.
- [ ] Time alinha prefixos de API e rotas UI (anotar decisão neste doc ou em PR).
- [ ] Paleta e logo Hub descritos em [HUB_BRANDING.md](./HUB_BRANDING.md) (tabela de tokens preenchida quando o design fechar valores).

---

## Epic 0-A — Auth, roles e routing pós-login (Hub)

**Objetivo**: garantir que apenas usuários de clínica acessam ao Hub, com routing correto por role, e que as decisões de identidade entre Hub e Vet estão formalizadas.

### Decisões de produto (registadas)

- **Hub e Vet são apps separadas**; usuários autenticam-se independentemente em cada uma. Não há handoff de sessão entre origens — isto é design intencional, não um bug.
- **Vet mantém-se como está**; não redireciona automaticamente staff de clínica para o Hub.
- **Sem novos roles para MVP**: Grooming/Boarding staff usam `CASSISTANT` com permissões namespaced (`grooming.*`, `boarding.*`) até que os módulos estejam em produção e a necessidade esteja demonstrada.

### Roles válidos no Hub

| Role | Quem é | Landing pós-login no Hub |
|------|--------|--------------------------|
| `CADMIN` | Dono/admin da clínica | `/hub/dashboard` |
| `CMANAGER` | Gerente da clínica | `/hub/dashboard` |
| `CASSISTANT` | Recepcionista / assistente | `/hub/appointments` |
| `CVET_INTERNAL` | Médico-veterinário interno | `/hub/encounters` |

Qualquer outro role (`VET`, `FREELANCER`, `ADMIN`) que tente fazer login no Hub é redirecionado para `VITE_VET_WEB_URL/login` via `window.location.replace` (não via React Router, que não suporta URLs externas).

### Entregas (implementadas)

- `CVET_INTERNAL` adicionado a `AppRole` em `packages/web-core/src/types.ts` e mapeado em `getUserRole` / `getDashboardPathForRole` em `authHelpers.ts`.
- `authNavigation.ts` (Hub): retorna `PostLoginDestination { type: 'internal' | 'external' }` com routing por role; roles não-Hub vão para `VET_URL/login`.
- `HubLoginPage.tsx`: usa `window.location.replace` para destinos externos, `navigate` para internos.
- `HubProtectedRoute.tsx`: valida `HUB_VALID_ROLES` usando `useAuth().role` e `clinic_user` do localStorage; mostra tela "Acesso não autorizado" em vez de redirecionar silenciosamente.

**Deps**: nenhum (não depende de outros épicos Hub).

**Aceite**

- [ ] Login com conta `CADMIN` → aterra em `/hub/dashboard`.
- [ ] Login com conta `CMANAGER` → aterra em `/hub/dashboard`.
- [ ] Login com conta `CASSISTANT` → aterra em `/hub/appointments`.
- [ ] Login com conta `CVET_INTERNAL` → aterra em `/hub/encounters`.
- [ ] Login com conta `VET` ou `FREELANCER` no Hub → redireciona para `VET_URL/login` (testar com `VITE_VET_WEB_URL` definido).
- [ ] Acesso direto a rota Hub protegida sem sessão → redireciona para `/login`.
- [ ] Acesso direto a rota Hub protegida com role não-Hub → tela "Acesso não autorizado".

---

## Epic 1 — Guardians (tutores) e vínculo com organização/unidade

**Objetivo**: cadastro de tutores utilizável pelo Hub.

**Entregas**

- Migração SQL: tabela `guardians` (ou nome acordado) com `organization_id`, dados de contato, timestamps, soft delete.
- Opcional: `guardian_phones` se multi-telefone for requisito MVP.
- API `GET/POST/PATCH` sob `/api/hub/guardians` com escopo por `clinic_id` / `organization_id` e `unit_id` quando aplicável.
- UI mínima: lista + formulário (pode ser página interna `/hub/guardians`), usando **layout e tokens PetMi Hub** ([HUB_BRANDING.md](./HUB_BRANDING.md)) — não o shell visual do dashboard Vet.

**Deps**: Epic 0; permissões `hub.guardians.*` (mínimo read/write para CMANAGER/CADMIN).

**Aceite**

- [ ] CADMIN/CMANAGER cria edita tutor na organização correta.
- [ ] CASSISTANT conforme matriz: apenas leitura ou sem acesso — documentado e coberto.
- [ ] Dados não vazam entre clínicas (teste manual com dois logins).

---

## Epic 2 — Pets reais + ownership tutor–pet

**Objetivo**: elevar `pets` de stub a entidade Hub com PetMi ID preparado.

**Entregas**

- Revisar schema atual de `pets`; adicionar `petmi_pet_id` UUID default `gen_random_uuid()`, `organization_id`, vínculos.
- Tabela `pet_guardians` (N:N `pet_id`, `guardian_id`, `organization_id`).
- **MVP (Fase 1)**: coluna `role` com valores mínimos `primary`, `secondary` (obrigatório ≥1 `primary` por pet na org). Opcional: booleanos `is_billing_contact`, `receives_notifications` na junção se o time quiser já filtrar contatos no check-in.
- **Alvo Fase 2 (documentar no schema, implementar após MVP estável)**: enum ou coluna `relationship_type` ampliada (`co_guardian`, `billing`, `emergency`, `caregiver`, `dog_walker`, … — lista fechada versionada) e/ou flags na junção (`can_approve_procedures`, `can_pickup_pet`, `is_emergency_contact`, `lives_with_pet`, …) ou JSON estrito com schema. Dados que dependem do **par tutor–pet** ficam na junção, não duplicados no guardian. Guardian institucional (ONG, lar) fica para evolução com **tipo de guardian** — ver [HUB_DOMAIN_MODEL.md](./HUB_DOMAIN_MODEL.md) (seção *Pet ownership* e *Guardian como CRM*) e [HUB_GUARDIAN_CRM_VISION.md](./HUB_GUARDIAN_CRM_VISION.md).
- API `/api/hub/pets` CRUD + listagem por unidade/org.
- UI: cadastro pet associado a ≥1 tutor.

**Deps**: Epic 1.

**Aceite**

- [ ] Criar pet com tutor primário obrigatório.
- [ ] Editar pet atualiza auditoria ou `updated_at`.
- [ ] Listagem filtra por organização logada.
- [ ] (Fase 2, quando existir) documentar migração de `role` simples para `relationship_type` + flags sem perda de dados.

---

## Epic 3 — Service types (catálogo mínimo)

**Objetivo**: tipos de serviço para classificar agenda (consulta, banho, hotel, …).

**Entregas**

- Tabela `hub_service_types` (nome, código, duração padrão opcional, `organization_id` ou global com override).
- Seed mínimo por org na criação da clínica ou endpoint de bootstrap.
- API CRUD restrita a CADMIN/CMANAGER.

**Deps**: Epic 0.

**Aceite**

- [ ] Org possui ≥3 tipos padrão após onboarding ou ação explícita.
- [ ] Agendamento (Epic 4) não aceita `service_type` de outra org.

---

## Epic 4 — Appointments (agenda universal)

**Objetivo**: calendário operacional por unidade.

**Entregas**

- Tabela `hub_appointments`: unit_id, pet_id, guardian_id, service_type_id, intervalo, status, staff_id opcional, notas.
- API listagem por intervalo de datas + CRUD.
- UI: visão dia/semana simples (pode reutilizar biblioteca já usada no projeto, se houver).

**Deps**: Epics 2, 3; permissões `hub.appointments.*`.

**Aceite**

- [ ] Criar compromisso em unidade A não aparece em unidade B.
- [ ] Conflito de recurso (opcional MVP): documentar se não há — “MVP sem double-booking prevention” é aceitável se explícito.
- [ ] Cancelamento preserva histórico (status `cancelled`, não hard delete).

---

## Epic 5 — Encounters + check-in / check-out

**Objetivo**: execução do dia — núcleo operacional.

**Entregas**

- Tabela `hub_encounters`: ligação opcional a `appointment_id`, unit_id, pet_id, timestamps check-in/out, status (`draft`, `in_progress`, `completed`), notas.
- Transições de estado validadas no backend.
- UI: fluxo “check-in” na lista do dia; tela de execução mínima; “check-out”.

**Deps**: Epic 4.

**Aceite**

- [ ] Walk-in: encounter sem appointment permitido (configurável).
- [ ] Check-out exige encounter `in_progress` ou regra documentada.
- [ ] Permissões: `hub.encounters.checkin` vs `perform` vs `checkout` testadas com CASSISTANT.

---

## Epic 6 — Pet timeline (read model)

**Objetivo**: histórico consolidado do pet para atendimento.

**Entregas**

- Tabela `pet_timeline_events` OU view; eventos emitidos ao concluir encounter (MVP).
- API `GET /api/hub/pets/:id/timeline`.
- UI: painel na ficha do pet.

**Deps**: Epic 5.

**Aceite**

- [ ] Concluir encounter cria evento visível na timeline.
- [ ] Paginação ou limite de N eventos com “carregar mais”.

---

## Epic 7 — Financeiro operacional (recebíveis, caixa, pagamentos)

**Objetivo**: ledger mínimo integrado à operação — **sem** usar apenas `hub_appointments.status = paid` como fonte da verdade. Ver [HUB_FINANCIAL_MODEL.md](./HUB_FINANCIAL_MODEL.md) e [HUB_FINANCIAL_IMPLEMENTATION_PLAN.md](./HUB_FINANCIAL_IMPLEMENTATION_PLAN.md).

**Entregas (evolução em relação ao MVP original)**

- Tabelas: `hub_receivables`, `hub_receivable_lines`, `hub_financial_adjustments`, `hub_payments`, `hub_cash_sessions`, `hub_cash_movements`; waive e `billing_state` em fontes (ver migrações `petimi_hub`).
- Recebível criado **só** após ação explícita «Gerar cobrança» (Grooming, Clínica, Orçamento); lista **Atendimentos sem cobrança** + contadores na Caixa/Dashboard.
- API: pré-visualização, criação de recebível, pagamentos parciais, caixa, (fase seguinte) despesas e dashboard gerencial.
- Permissões: `hub.financial.read` / `hub.financial.write`, `hub.cash.session`, `hub.cash.receive`, `hub.receivables.create` (ver [PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md)).

**Deps**: Epic 4–5 (agenda e encounters como fontes); Banho & Tosa operacional para `grooming_session`.

**Aceite**

- [ ] Nenhum recebível é criado automaticamente ao concluir encounter ou sessão de grooming nem ao aceitar orçamento.
- [ ] Operador vê atendimentos concluídos **sem cobrança** e consegue iniciar «Gerar cobrança» ou registar **waive** com motivo.
- [ ] Vários pagamentos por recebível; soma do dia por unidade coerente com `hub_payments`.

---

## Epic 8 — Dashboard operacional mínimo

**Objetivo**: visão gerencial da unidade.

**Entregas**

- Endpoint agregando: compromissos do dia, encounters em andamento, pagamentos do dia, contagem de pets atendidos.
- UI card no dashboard clínica existente **ou** nova página `/hub/dashboard` (preferência: rota Hub isolada).

**Deps**: Epics 4–7.

**Aceite**

- [ ] Números batem com lista bruta (sanity check documentado no PR).
- [ ] Escopo sempre `unit_id` atual do contexto.

---

## Epic 9 — WhatsApp / comunicação (MVP operacional, **sem custo**)

**Objetivo**: comunicação rápida sem CRM completo.

> **Decisão de produto (jun/2026):** usar **apenas o que não tem custo**. No MVP, WhatsApp via **link de clique para conversar** (`wa.me` / click-to-chat) — sem API paga, sem provedor, sem templates aprovados pela Meta — somado a **notificação in-app** para a equipe. A WhatsApp Business **Cloud API** (paga) fica como fase futura. Plano completo: [HUB_COMMUNICATION_WHATSAPP_PLAN.md](./HUB_COMMUNICATION_WHATSAPP_PLAN.md).

**Entregas**

- Utilitário `buildWhatsappLink` + templates de texto local (ex.: “Seu pet está pronto”).
- Botão «WhatsApp» na ficha do tutor/pet, drawer de B&T (`ready`), Hotel & Creche e Leva e Traz.
- (Opcional) Log de **tentativa** (tabela `hub_message_logs`) sem conteúdo sensível.
- Notificação in-app reusando o sistema do Vet (`notificationsController`).

**Deps**: Epic 1 (telefone do tutor).

**Aceite**

- [ ] Botão abre conversa com a mensagem pré-preenchida correta; telefone inválido desabilita o botão.
- [ ] Nenhuma chamada a API paga / nenhum custo gerado.
- [ ] Falha de validação de telefone não quebra check-out (apenas botão desabilitado/alerta UI).

---

## Ordem de entrega recomendada

| Ordem | Epic | Notas |
|-------|------|--------|
| 1 | Epic 0 | Documentação + health |
| 2 | Epic 1 | Tutores primeiro |
| 3 | Epic 2 | Pets |
| 4 | Epic 3 | Service types |
| 5 | Epic 4 | Agenda |
| 6 | Epic 5 | Encounters |
| 7 | Epic 6 | Timeline |
| 8 | Epic 7 | Pagamentos |
| 9 | Epic 8 | Dashboard |
| 10 | Epic 9 | WhatsApp (pode paralelizar após Epic 1 se equipe maior) |

---

## Critério de sucesso da Fase 1 (release “Hub Foundation”)

Conforme plano estratégico:

1. Cadastrar tutor e pet.
2. Agendar serviço.
3. Check-in → atendimento → check-out.
4. Registrar observações (encounter notes).
5. Gerar cobrança e registar pagamento no ledger (`hub_receivables` / `hub_payments`), conforme [HUB_FINANCIAL_MODEL.md](./HUB_FINANCIAL_MODEL.md).
6. Ver histórico/timeline do pet.
7. Ver dashboard básico da unidade.
8. (Opcional release) Disparar mensagem WhatsApp template.

---

## Módulos operacionais no MVP (planos em fases)

Decisão (jun/2026): os módulos abaixo **permanecem no MVP** e têm plano de implementação em fases dedicado.

- **Banho & Tosa** — [HUB_GROOMING_OPERATIONAL_PLAN.md](./HUB_GROOMING_OPERATIONAL_PLAN.md) (Fases 0–3 concluídas).
- **Hotel & Creche** — [HUB_BOARDING_OPERATIONAL_PLAN.md](./HUB_BOARDING_OPERATIONAL_PLAN.md) (hoje placeholder; agenda/preço já existem).
- **Leva e Traz** — [HUB_PICKUP_DELIVERY_OPERATIONAL_PLAN.md](./HUB_PICKUP_DELIVERY_OPERATIONAL_PLAN.md) (hoje placeholder; perna de transporte já existe na agenda).

## Qualidade / release

- **QA manual do MVP** — cenários passo a passo (multi-tenant, permissões, fluxos core, financeiro): [HUB_MVP_MANUAL_QA.md](./HUB_MVP_MANUAL_QA.md).
- **Testes automatizados** — plano para financeiro e atendimento: [HUB_AUTOMATED_TESTING_PLAN.md](./HUB_AUTOMATED_TESTING_PLAN.md).

## Pós-MVP imediato (não bloqueia release Foundation)

- Entitlements por módulo (`module.hub_core`, …).
- Consentimento LGPD explícito em guardian/pet.
- Integração bidirecional com vet-match (demanda gerada a partir de escala) — Fase ecossistema.
- WhatsApp Business Cloud API (paga) — evolução do [plano de comunicação](./HUB_COMMUNICATION_WHATSAPP_PLAN.md).

---

## Backlog — cadastro Hub (pessoa admin + primeira unidade)

**Não priorizado para a Foundation atual.** O signup do PetMi Vet concentra dados na **empresa** + credenciais; o admin principal fica sem um perfil de **pessoa** claro. Para o Hub, documentámos a intenção de um fluxo **em sequência**: primeiro **cadastro da pessoa como administrador** (dados humanos + role), em seguida **cadastro da primeira unidade**, antes de usar o produto.

Detalhe, decisões em aberto e critérios de aceite rascunho: [HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md](./HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md).

---

## Backlog — orçamentos e contatos (sem “falso cliente”)

**Implementado no código (MVP):** migração `create_hub_prospects_and_quotes.sql`, rotas Hub e UI em `/hub/orcamentos`. PDF, notificações e PJ permanecem backlog — ver [HUB_QUOTES_AND_PROSPECTS.md](./HUB_QUOTES_AND_PROSPECTS.md).
