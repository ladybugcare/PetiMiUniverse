# QA manual — PetMi Hub MVP (cenários passo a passo)

Roteiro de **teste manual** para validar o MVP do PetMi Hub antes de cada release. Foco prioritário: **isolamento multi-tenant** (dados não vazam entre clínicas/unidades) e **permissões por role**. Complementa o [QA do Epic 1](./HUB_EPIC1_MANUAL_QA.md) (tutores) com os fluxos operacionais e financeiros.

> Executar em **staging** quando possível. Como hoje o desenvolvimento ocorre direto em produção, ao testar em prod use dados claramente marcados (ex.: nome `QA TESTE …`) e **remova/arquive** ao final.

---

## Matriz de roles (referência)

Permissões reais em `backend/src/utils/permissions.ts`. `CADMIN` tem acesso irrestrito (`isClinicAdminRole`).

| Role | Resumo de acesso Hub |
|------|----------------------|
| `CADMIN` | Tudo |
| `CMANAGER` | Quase tudo (sem delete de org) — guardians/pets/serviços/agenda/clínica/financeiro/caixa write |
| `CASSISTANT` | Leitura ampla + `appointments.write`; **sem** `guardians.write`, **sem** financeiro/caixa write |
| `CVET_INTERNAL` | `clinic.read/write`, `appointments.read`, `financial.read`; **sem** guardians/pets write |
| `CGROOMER` | `grooming.queue.read/manage`, leitura de guardians/pets/serviços/agenda |
| `CFINANCE` | `financial.*`, `cash.*`, `receivables.create`, `inventory.write`; leitura de guardians/pets |

---

## Pré-requisitos (setup do ambiente de teste)

1. **Duas clínicas** distintas: **Clínica A** e **Clínica B** (orgs separadas), cada uma com onboarding concluído e ≥1 unidade.
2. **Usuários por role** na Clínica A: um `CADMIN`, um `CMANAGER`, um `CASSISTANT`, um `CVET_INTERNAL`, um `CGROOMER`, um `CFINANCE`.
3. Pelo menos **1 unidade extra** na Clínica A (ex.: Unidade A1 e A2) para testar isolamento por unidade.
4. Tipos de serviço configurados (rodar bootstrap ou criar) cobrindo grupos `banho_tosa`, `hotel`/`creche`, `clinica`.
5. Backend e Hub web no ar; `VITE_VET_WEB_URL` definido (para testar redirecionamento de roles não-Hub).

**Convenção de resultado:** ✅ passou · ❌ falhou (abrir issue) · ⚠️ passou com ressalva.

---

## Bloco 1 — Autenticação e routing por role (Epic 0-A)

### 1.1 Landing por role
| # | Passos | Esperado |
|---|--------|----------|
| 1 | Login como `CADMIN` no Hub | Aterra em `/hub/dashboard` |
| 2 | Login como `CMANAGER` | Aterra em `/hub/dashboard` |
| 3 | Login como `CASSISTANT` | Aterra em `/hub/appointments` (agenda) |
| 4 | Login como `CVET_INTERNAL` | Aterra em `/hub/encounters` → redireciona para `/hub/clinica/atendimentos` |

### 1.2 Roles não-Hub são barradas
1. Tentar login no Hub com uma conta `VET` ou `FREELANCER`.
2. **Esperado:** `window.location.replace` para `VITE_VET_WEB_URL/login` (não fica preso no Hub).

### 1.3 Acesso sem sessão / sem permissão
1. Abrir uma rota Hub protegida (ex.: `/hub/financeiro`) **sem** sessão → redireciona para `/login`.
2. Abrir rota Hub com role válido porém sem a permissão da página → tela «Acesso não autorizado» (não redireciona em silêncio).

### 1.4 Token ausente/inválido (API)
1. `GET /api/hub/guardians` **sem** header `Authorization: Bearer` → **401**.
2. `GET /api/hub/health` → **200** com `{ ok: true, product: 'hub' }`.

---

## Bloco 2 — Isolamento multi-tenant (crítico)

> Objetivo: garantir que **nenhum dado vaza entre clínicas** e que o escopo de **unidade** é respeitado.

### 2.1 Isolamento entre clínicas — Tutores e Pets
1. Login na **Clínica A** (`CADMIN`); criar tutor «QA TESTE TutorA» e um pet «QA PetA».
2. Login na **Clínica B**; ir a `/hub/clientes` e `/hub/pets`.
3. **Esperado:** Clínica B **não** vê TutorA nem PetA.
4. (API) Como Clínica B, tentar `GET /api/hub/guardians/{id_do_TutorA}` → **404/403** (nunca o registro).

### 2.2 Isolamento entre clínicas — Agenda
1. Clínica A: criar um agendamento na Unidade A1.
2. Clínica B: abrir `/hub/appointments`.
3. **Esperado:** o agendamento da Clínica A não aparece.

### 2.3 Isolamento entre clínicas — Financeiro
1. Clínica A: gerar uma cobrança e registrar um pagamento (ver Bloco 5).
2. Clínica B: abrir `/hub/financeiro` e `/hub/caixa`.
3. **Esperado:** recebível e pagamento da Clínica A não aparecem; somatórios da Clínica B não os incluem.

### 2.4 Escopo por unidade (dentro da mesma clínica)
1. Clínica A, selecionar **Unidade A1**: criar agendamento.
2. Trocar para **Unidade A2** (seletor de unidade no header).
3. **Esperado:** o agendamento criado em A1 **não** aparece em A2 (e vice-versa). Confirmar para agenda, fila clínica, fila B&T e caixa.

### 2.5 Manipulação de ID cross-tenant (API)
1. Logado na Clínica B, tentar `PATCH /api/hub/appointments/{id_da_Clínica_A}` com body válido.
2. **Esperado:** **403/404**; nenhuma alteração no registro da Clínica A.

---

## Bloco 3 — Permissões por role (negativa e positiva)

> Para cada caso, testar pela **UI** (botão/menu visível ou não) **e** pela **API** (deve retornar 403 quando sem permissão), porque esconder na UI não basta.

### 3.1 CASSISTANT
| Ação | UI esperado | API esperado |
|------|-------------|--------------|
| Ver lista de tutores | Vê | `GET /guardians` 200 |
| Criar/editar tutor | **Sem** botão | `POST /guardians` → **403** |
| Criar/editar agendamento | Vê e consegue | `POST /appointments` 200 |
| Abrir caixa | **Sem** acesso | `POST /finance/cash-sessions/open` → **403** |
| Registrar pagamento | **Sem** acesso | `POST /finance/receivables/:id/payments` → **403** |

### 3.2 CVET_INTERNAL
| Ação | Esperado |
|------|----------|
| Atender (encounters) | `clinic.write` → consegue criar/editar atendimento |
| Criar tutor/pet | **403** (sem `pets.write`/`guardians.write`) |
| Ver financeiro | `financial.read` → vê leitura; **sem** write (`POST /finance/expenses` → **403**) |

### 3.3 CGROOMER
| Ação | Esperado |
|------|----------|
| Fila Banho & Tosa, avançar estágio | `grooming.queue.manage` → consegue |
| Ver preços/subtotal no drawer B&T | **Não vê** (sem `hub.service_types.write`) — só nomes |
| Acessar financeiro/caixa | **Sem** acesso |

### 3.4 CFINANCE
| Ação | Esperado |
|------|----------|
| Gerar cobrança, receber pagamento, abrir/fechar caixa | Consegue (`financial.*`, `cash.*`, `receivables.create`) |
| Editar prontuário clínico | **403** (sem `clinic.write`) |
| Criar agendamento | Leitura apenas (`appointments.read`); `POST /appointments` → **403** |

### 3.5 CMANAGER
1. Confirmar acesso amplo (guardians/pets/serviços/agenda/clínica/financeiro/caixa write).
2. Confirmar que **delete de organização/unidade** restrito a CADMIN não é permitido.

---

## Bloco 4 — Fluxo core operacional (caminho feliz)

> Cobre o critério de sucesso da Fase 1: tutor → pet → agendar → atender → cobrar → pagar → timeline → dashboard.

### 4.1 Cadastro base
1. Como `CMANAGER`, criar tutor «QA TESTE Maria» com telefone válido.
2. Criar pet «QA Rex» vinculado a Maria como tutor **primário**.
3. **Esperado:** pet exige ≥1 tutor primário; aparece na lista filtrada pela org.

### 4.2 Agendamento
1. Criar agendamento para QA Rex, serviço do grupo `clinica`, na Unidade A1, horário futuro.
2. **Esperado:** aparece na agenda da Unidade A1 com status inicial.

### 4.3 Atendimento (encounter)
1. Em `/hub/clinica/atendimentos`, fazer **check-in** do agendamento (abre encounter).
2. Registrar notas/SOAP; **concluir** (check-out).
3. **Esperado:** transições de estado válidas (não pular direto para concluído sem in_progress); encounter concluído.

### 4.4 Banho & Tosa (fila)
1. Criar agendamento do grupo `banho_tosa`; ir a `/hub/banho-tosa`.
2. Check-in → avançar estágios até «Pronto»; registrar checklist e um **adicional**.
3. **Esperado:** card move pelas colunas; checklist e adicional persistem.

### 4.5 Pet timeline
1. Abrir a ficha do pet / timeline clínica.
2. **Esperado:** o atendimento concluído aparece como evento na timeline.

---

## Bloco 5 — Financeiro e caixa (regras de negócio)

> Regra de ouro: **nenhum recebível é criado automaticamente**. Sempre exige «Gerar cobrança» ou **waive** explícito.

### 5.1 Atendimentos sem cobrança
1. Após concluir o encounter (4.3) e a sessão B&T (4.4), abrir `/hub/financeiro` → lista **Atendimentos sem cobrança**.
2. **Esperado:** ambos aparecem como pendentes de cobrança; contador no Caixa/Dashboard coerente.

### 5.2 Gerar cobrança e pagar
1. Em um atendimento sem cobrança, acionar **Gerar cobrança** (cria `hub_receivables` + linhas).
2. Abrir o caixa (`CFINANCE`/`CADMIN`) → registrar **pagamento parcial**, depois o restante.
3. **Esperado:** vários `hub_payments` por recebível; saldo do recebível zera; soma do dia na unidade bate com `hub_payments`.

### 5.3 Waive (dispensar cobrança)
1. Em outro atendimento sem cobrança, acionar **waive** com **motivo obrigatório**.
2. **Esperado:** sai da lista sem cobrança; nenhum recebível criado; motivo registrado.

### 5.4 Estorno / cancelamento
1. Estornar um pagamento (`POST /finance/payments/:id/reverse`).
2. Cancelar um recebível (`POST /finance/receivables/:id/cancel`).
3. **Esperado:** histórico preservado (status, não hard delete); somatórios atualizados.

### 5.5 Fechamento de caixa
1. Fechar o caixa do dia.
2. **Esperado:** resumo da sessão (aberturas, recebimentos, sangrias/suprimentos) coerente; não permite operar pagamento sem caixa aberto se essa for a regra.

---

## Bloco 6 — Orçamentos

1. Como `CMANAGER`, criar orçamento (quote) para um prospect, enviar e gerar **public token**.
2. Abrir `/orcamento/:token` em janela anônima.
3. **Esperado:** visualização pública sem login; orçamento `accepted` **não** cria recebível (fica `awaiting_billing` até «Gerar cobrança»).

---

## Bloco 7 — Módulos placeholder (escopo MVP)

> Hotel & Creche e Leva e Traz **estão no MVP** mas em construção (ver planos dedicados). Validar apenas o estado atual.

1. Abrir `/hub/hotel-creche` e `/hub/leva-e-traz`.
2. **Esperado (hoje):** página «Em breve»/skeleton conforme fase atual de cada plano ([Hotel & Creche](./HUB_BOARDING_OPERATIONAL_PLAN.md), [Leva e Traz](./HUB_PICKUP_DELIVERY_OPERATIONAL_PLAN.md)). Atualizar estes casos conforme as fases avançam.

---

## Registro de execução

| Data | Ambiente | Versão/commit | Bloco | Resultado | Notas / issues |
|------|----------|---------------|-------|-----------|----------------|
|      |          |               |       |           |                |

### Resumo da rodada
- Total ✅ / ❌ / ⚠️:
- Bloqueadores para release:
- Itens de limpeza de dados de teste (prod):

---

*Última atualização: jun/2026. Manter alinhado a `permissions.ts` e às rotas em `backend/src/modules/hub/routes/index.ts`.*
