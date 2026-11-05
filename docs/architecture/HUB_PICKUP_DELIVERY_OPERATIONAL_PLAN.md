# PetMi Hub — Plano operacional Leva e Traz (motorista-first)

Documento de arquitetura da **operação de transporte de pets (Leva e Traz)** (`/hub/leva-e-traz`), alinhado ao [modelo de domínio](./HUB_DOMAIN_MODEL.md) e ao modelo motorista-first implementado em agosto/2026.

---

## Decisões de produto

- **WhatsApp removido** das telas operacionais (board e visão do motorista). Manter apenas `Ligar` (`tel:`) na visão do motorista e no drawer.
- **Entrada por papel** (shell com abas, como Banho & Tosa):
  - Sem `pickup.routes.manage` e com `pickup.stops.update` → `/hub/leva-e-traz` redireciona para **Minha rota**; subnav oculta.
  - Com `pickup.routes.manage` → **Rotas do dia** (planejamento); aba **Minha rota** disponível.
- **Gestão = planejar rotas** (início/fim do dia): lista **A planejar** (pernas sem rota) + construtor; acompanhar status é apoio (seção colapsável + Monitorar), não Kanban na home.
- **Concluir coleta não cria entrega.** Entrega nasce no agendamento.
- **Modo L&T no agendamento:** seletor **Ida e volta** (default) | **Só busca** | **Só retorno**.

**Princípio:** *agendamento = intenção; parada = execução; cobrança nunca automática por status.*

---

## Vocabulário

| Termo | Significado |
|--------|-------------|
| Coleta (`pickup`) | Casa do tutor → clínica |
| Entrega (`delivery`) | Clínica → tutor (após serviço) |
| Fim da coleta | Pet **na clínica** |
| Fim da entrega | Pet **com o tutor** |

---

## Modelo de status da parada (`hub_pickup_stops.status`)

| Status | Label coleta | Label entrega |
|--------|--------------|---------------|
| `pending` | A fazer | A fazer |
| `en_route` | A caminho do tutor | A caminho do tutor |
| `arrived` | No endereço | No endereço |
| `in_transit` | Pet a bordo | *(não usado)* |
| `completed` | Na clínica | Entregue |
| `failed` | Falhou | Falhou |

**Transições:**
- Coleta: `pending → en_route → arrived → in_transit → completed | failed`
- Entrega: `pending → en_route → arrived → completed | failed` (sem `in_transit`)

**Sync do agendamento (`hub_appointments.status`):**
- `pending|en_route|arrived|in_transit` da parada → `in_progress` (perna `pickup_route`)
- `completed` da parada → `done` (perna `pickup_route`)
- `pending` (criação de parada solta) → `confirmed`

### Chegada na unidade → módulo do agendamento pai

Quando a **coleta** (`direction=pickup`) ou o **desembarque** (`clinic_return`) vai para `completed` (= pet na clínica), o backend propaga a chegada ao agendamento pai (`parent_appointment_id`), sem iniciar atendimento profissional:

| Módulo do pai | Ação operacional | Status do pai na agenda |
|---------------|------------------|-------------------------|
| Banho & Tosa | Abre/avança sessão para `queued` (Na fila) | `checked_in` |
| Clínica / internação / cirurgia | Só marca presença | `checked_in` (Aguardando) |
| Hotel / creche | Check-in da reserva | `in_progress` |

- **Não** abre `hub_encounters` automaticamente (consultório continua exigindo «Atender»).
- **Não** regride se o pai já estiver em serviço / finalizado / cancelado.
- Entrega (`delivery` → `completed`) **não** dispara este fluxo (pet saindo) e **não** avança o estágio de Banho & Tosa (`delivered`/`closed` no salão são manuais / caminho operacional, não a parada do motorista).
- No day-board de Banho & Tosa, badge/filtro L&T usa `has_pickup_legs` (existência de filhos `pickup_route`), não o `appointment_kind` do pai.
- Notificações: `hub_pet_arrived` (banho/clínica/avulso) ou `hub_boarding_checkin` (hotel/creche). Em lote no `clinic_return`, uma notificação por pet.
- Implementação: `backend/src/modules/hub/pickupArrival.ts` (chamado de `patchHubPickupStop` e `createOrUpdateLooseStop`).

---

## Permissões

| Permissão | Descrição | Roles sugeridas |
|-----------|-----------|-----------------|
| `pickup.routes.read` | Ver rotas/paradas do dia | CADMIN, CMANAGER, CASSISTANT, motorista |
| `pickup.routes.manage` | Montar rota, ordenar paradas, atribuir motorista | CADMIN, CMANAGER, CASSISTANT |
| `pickup.stops.update` | Atualizar status de parada | + perfil motorista |

---

## Superfícies

### 1. Minha rota de hoje (`/hub/leva-e-traz/minha-rota`)

- Página principal para o motorista (aba no shell; motorista puro não vê a subnav).
- `GET /api/hub/pickup/my-route?clinic_id&date` → rota onde `driver_staff_id` = staff do usuário autenticado.
- Componente: `PickupMyRoutePage` (usa `PickupDriverView` com o `routeId` encontrado).
- Empty state: "Nenhuma rota atribuída a você hoje."
- Sem botão WhatsApp; manter `Ligar` (`tel:`).
- Redirect automático de `/hub/leva-e-traz` quando usuário tem `stops.update` mas não `routes.manage`.

### 2. Rotas do dia — gestão (`/hub/leva-e-traz`)

Componentes: `HubPickupShell`, `HubPickupPage`, `PickupPlanningList`, `PickupRoutePanel`, `PickupRouteBuilder`.

Público: quem tem `pickup.routes.manage` (recepção / gestão). Fluxo típico: no início do dia (ou fim do anterior) ver pernas e montar rotas para motoristas.

**Layout (ordem):**

1. Toolbar — dia, busca, unidade, refresh, **Nova rota**, Agenda
2. Chips — Todas / Coletas / Entregas
3. Métricas clicáveis — Sem rota · Em rotas · Em deslocamento · Concluídas
4. **A planejar** — lista densa das pernas **sem rota** (horário, pet/tutor, sentido, endereço); seleção múltipla + «Montar rota» / «Adicionar à rota»
5. **Rotas do dia** — cards compactos (motorista, N paradas, status, Monitorar, editar, reordenar lotes)
6. **Em andamento** (colapsável) — só paradas `en_route` / `arrived` / `in_transit`

Status fino de execução fica na **Minha rota** (motorista), no **Monitorar** e no drawer de parada — não há Kanban de 4 colunas na home gerencial.

### 3. Drawer de parada (`PickupStopDrawer`)

- Labels de status e botão de avanço por sentido.
- Pernas soltas: ao avançar, chama `POST /api/hub/pickup/stops` para materializar a parada.
- Sem botão WhatsApp; manter `Ligar`.

### 4. Visão do motorista (`PickupDriverView`)

- Usado diretamente via deep link `/hub/leva-e-traz/motorista/:routeId`.
- Avanço direction-aware: `arrived → in_transit` (Pet a bordo) para coleta; `arrived → completed` (Entregue) para entrega.
- Sem botão WhatsApp; manter `Ligar`.

### 5. Monitoramento inferido (`PickupRouteMonitorPage`)

- Rota: `/hub/leva-e-traz/monitoramento/:routeId`.
- Permissão: `pickup.routes.manage` (quem monta a rota). Motorista puro não acessa.
- Entrada: link **Monitorar** no painel de rotas.
- **Sem GPS.** Posição do motorista no mapa é inferida pelos status das paradas:
  - rota planejada / todas `pending` → ponto de saída;
  - `en_route` → último ponto confirmado (ou saída), destino = parada ativa;
  - `arrived` → no endereço da parada;
  - `in_transit` (coleta) → no endereço da coleta; destino = próxima parada (outra coleta/entrega ou `clinic_return`);
  - `clinic_return` em deslocamento/no local → retorno à clínica (coords do start);
  - todas concluídas → última parada concluída.
- Lateral: histórico de `hub_pickup_stop_events` (transições de status com horário) + lista de paradas.
- Poll ~20s via `GET /pickup/routes/:id` (inclui `events` e `updated_at` nas stops).

---

## Agendamento: pernas L&T (`NewAppointmentModal`)

- Seletor **Ida e volta | Só busca | Só retorno** (acima dos blocos de horário).
- Payload: envia `with_pickup_route_before` / `with_pickup_route_after` conforme o modo.
- Pernas geradas recebem `parent_appointment_id` = UUID do atendimento principal.

---

## API endpoints (Leva e Traz)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| `GET` | `/pickup/day-board` | `routes.read` | Board do dia |
| `GET` | `/pickup/routes` | `routes.read` | Listar rotas |
| `POST` | `/pickup/routes` | `routes.manage` | Criar rota |
| `GET` | `/pickup/routes/:id` | `routes.read` | Detalhe da rota (+ `events` de status) |
| `PATCH` | `/pickup/routes/:id` | `routes.manage` | Atualizar rota |
| `POST` | `/pickup/routes/:id/stops` | `routes.manage` | Adicionar paradas à rota |
| `PATCH` | `/pickup/stops/:id` | `stops.update` | Avançar/atualizar parada (grava evento) |
| `POST` | `/pickup/stops` | `stops.update` | Criar/atualizar parada solta (sem rota) |
| `GET` | `/pickup/my-route` | `routes.read` | Rota do dia do motorista autenticado |
| `POST` | `/pickup/routes/suggest-batches` | `routes.manage` | Sugerir lotes por janela de horário + capacidade (não persiste) |

### Sugestão de lotes (`suggest-batches`)

- Body: `window_minutes` (`0` = mesmo minuto, `15`, `30`), `capacity` (obrigatória se sem veículo), `stops[]` com `starts_at`.
- Heurística: ordena por horário → agrupa na janela → empacota até `capacity` (**1 pet por parada**, coleta e entrega).
- Sem veículo e sem `capacity` → `422` (não há mais chute automático).
- UI: diálogo no montador pede janela sempre; capacidade só editável sem veículo (com veículo usa a do carro).

---

## Arquivos-chave

- `packages/hub-ui/src/pages/pickup/HubPickupRoutes.tsx` — shell + rotas (Rotas do dia / Minha rota)
- `packages/hub-ui/src/pages/pickup/PickupPlanningList.tsx` — lista A planejar
- `packages/hub-ui/src/pages/pickup/PickupRouteBuilder.tsx` — montagem de rota + sugerir lotes
- `backend/src/modules/hub/hubPickupSuggestBatches.ts` — partição por janela/capacidade
- `packages/hub-ui/src/pages/pickup/` — todos os componentes operacionais
- `packages/hub-ui/src/pages/pickup/PickupRouteMonitorPage.tsx` — monitoramento gerencial
- `packages/hub-ui/src/pages/pickup/inferDriverMapPosition.ts` — regra de posição inferida
- `packages/hub-ui/src/api/hubPickupApi.ts` — tipos e cliente API
- `backend/src/modules/hub/hubPickupController.ts` — lógica backend
- `backend/src/modules/hub/hubAppointmentsController.ts` — criação das pernas
- `packages/hub-ui/src/pages/agenda/NewAppointmentModal.tsx` — agendamento L&T
- `apps/hub-web/src/App.tsx`, `HubSidebar.tsx` — rotas e navegação
- `backend/database_migrations/petimi_hub/083_alter_hub_pickup_stops_in_transit.sql` — migration `in_transit`
- `backend/database_migrations/petimi_hub/092_create_hub_pickup_stop_events.sql` — histórico de status

---

## Fora de escopo

- Templates WhatsApp operacionais
- GPS / tracking em tempo real (pings do celular ou rastreador de frota)
- Ordenação de paradas por distância
- Role dedicado de motorista
