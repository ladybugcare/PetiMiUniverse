# PetMi Hub — Plano operacional Leva e Traz (motorista-first)

Documento de arquitetura da **operação de transporte de pets (Leva e Traz)** (`/hub/leva-e-traz`), alinhado ao [modelo de domínio](./HUB_DOMAIN_MODEL.md) e ao modelo motorista-first implementado em agosto/2026.

---

## Decisões de produto

- **WhatsApp removido** das telas operacionais (board e visão do motorista). Manter apenas `Ligar` (`tel:`) na visão do motorista e no drawer.
- **Entrada por papel:**
  - Sem `pickup.routes.manage` e com `pickup.stops.update` → `/hub/leva-e-traz` redireciona para **Minha rota de hoje**.
  - Com `pickup.routes.manage` → abre o **board de recepção**; link "Minha rota" no header.
- **Board de recepção:** 4 colunas baseadas no `status` da **parada** (`hub_pickup_stops`), não do agendamento.
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
- `pending|en_route|arrived|in_transit` da parada → `in_progress`
- `completed` da parada → `done`
- `pending` (criação de parada solta) → `confirmed`

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

- Página principal para o motorista.
- `GET /api/hub/pickup/my-route?clinic_id&date` → rota onde `driver_staff_id` = staff do usuário autenticado.
- Componente: `PickupMyRoutePage` (usa `PickupDriverView` com o `routeId` encontrado).
- Empty state: "Nenhuma rota atribuída a você hoje."
- Sem botão WhatsApp; manter `Ligar` (`tel:`).
- Redirect automático de `/hub/leva-e-traz` quando usuário tem `stops.update` mas não `routes.manage`.

### 2. Board de recepção (`/hub/leva-e-traz`)

Componentes: `HubPickupPage`, `PickupDayBoard`.

**Colunas (4):**

| # | Label | Status(es) da parada |
|---|-------|----------------------|
| 1 | A fazer | `pending` (ou perna solta sem stop ainda) |
| 2 | Em deslocamento | `en_route` |
| 3 | No local / a bordo | `arrived`, `in_transit` |
| 4 | Concluídas | `completed` (falhas com pill) |

- Botão de avanço com label por sentido (`A caminho`, `No endereço`, `Pet a bordo`, `Na clínica` / `Entregue`).
- Badge de pareamento: mostra a perna irmã (mesmo `parent_appointment_id`, sentido oposto) com horário.
- Link "Minha rota" no header.

### 3. Drawer de parada (`PickupStopDrawer`)

- Labels de status e botão de avanço por sentido.
- Pernas soltas: ao avançar, chama `POST /api/hub/pickup/stops` para materializar a parada.
- Sem botão WhatsApp; manter `Ligar`.

### 4. Visão do motorista (`PickupDriverView`)

- Usado diretamente via deep link `/hub/leva-e-traz/motorista/:routeId`.
- Avanço direction-aware: `arrived → in_transit` (Pet a bordo) para coleta; `arrived → completed` (Entregue) para entrega.
- Sem botão WhatsApp; manter `Ligar`.

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
| `GET` | `/pickup/routes/:id` | `routes.read` | Detalhe da rota |
| `PATCH` | `/pickup/routes/:id` | `routes.manage` | Atualizar rota |
| `POST` | `/pickup/routes/:id/stops` | `routes.manage` | Adicionar paradas à rota |
| `PATCH` | `/pickup/stops/:id` | `stops.update` | Avançar/atualizar parada |
| `POST` | `/pickup/stops` | `stops.update` | Criar/atualizar parada solta (sem rota) |
| `GET` | `/pickup/my-route` | `routes.read` | Rota do dia do motorista autenticado |

---

## Arquivos-chave

- `packages/hub-ui/src/pages/pickup/` — todos os componentes operacionais
- `packages/hub-ui/src/api/hubPickupApi.ts` — tipos e cliente API
- `backend/src/modules/hub/hubPickupController.ts` — lógica backend
- `backend/src/modules/hub/hubAppointmentsController.ts` — criação das pernas
- `packages/hub-ui/src/pages/agenda/NewAppointmentModal.tsx` — agendamento L&T
- `apps/hub-web/src/App.tsx`, `HubSidebar.tsx` — rotas e navegação
- `backend/database_migrations/petimi_hub/083_alter_hub_pickup_stops_in_transit.sql` — migration `in_transit`

---

## Fora de escopo

- Templates WhatsApp operacionais
- GPS / tracking em tempo real
- Ordenação de paradas por distância
- Role dedicado de motorista
