# PetMi Hub — Notas internas e handoff (backlog pós-MVP)

**Estado:** backlog — **não bloqueia** o MVP Foundation.  
**Contexto:** a comanda já implementa separação **caixa** (`notes`) vs **financeiro** (`finance_notes`) com congelamento após `finance_handoff_at`. Este documento regista melhorias **opcionais** em orçamento e agendamento, e evoluções que **não** devem ser replicadas “por simetria” antes do MVP.

Referências:
- [HUB_FINANCIAL_MODEL.md](./HUB_FINANCIAL_MODEL.md)
- [HUB_QUOTES_AND_PROSPECTS.md](./HUB_QUOTES_AND_PROSPECTS.md)
- Migrations: `alter_hub_comandas_client_notes.sql`, `alter_hub_comandas_finance_notes.sql`

---

## O que já está no MVP (comanda)

| Campo | Papel |
|-------|--------|
| `hub_comandas.notes` | Observação interna do **caixa** — editável só no Caixa até `finance_handoff_at` |
| `hub_comandas.finance_notes` | Observação interna do **financeiro** — editável só no Financeiro após handoff |
| `hub_comandas.client_notes` | Mensagem ao cliente (PDF e link público) |

**Regra:** handoff caixa → financeiro na **mesma entidade** (`hub_comandas`) justifica dois campos + bloqueio no `PATCH`.

---

## O que **não** fazer agora

- Replicar `notes` + `finance_notes` + `finance_handoff_at` em **orçamento** e **agendamento** “por simetria”.
- Timeline genérica de notas em todas as entidades (bom produto, escopo grande).
- Bloquear `hub_appointments.financial_notes` quando a comanda vinculada recebe handoff (acoplamento frágil entre tabelas).

---

## Estado atual das outras entidades

### Orçamento (`hub_quotes`)

| Campo | Papel |
|-------|--------|
| `notes` | Interno da equipe (comercial) |
| `client_notes` | Visível no link/PDF público |

- Não há fluxo “enviar ao financeiro” no orçamento; cobrança ocorre na **comanda** ou recebível.
- Ao abrir comanda a partir de orçamento: herda `client_notes`; **não** herda `notes` interno hoje.

### Agendamento (`hub_appointments`)

| Campo | Papel |
|-------|--------|
| `notes` | Notas operacionais do atendimento |
| `financial_notes` | Notas financeiras (desconto, ajuste, etc.) |

- Já existe separação operacional vs financeira na agenda.
- Ao agendar a partir de orçamento: `quote.notes` é copiado para `financial_notes` do agendamento (cópia pontual, sem congelamento).
- Ao abrir comanda a partir de agendamento: **não** copia `financial_notes` para a comanda hoje.

---

## Backlog priorizado (pós-MVP)

### Prioridade alta — herança de contexto na abertura da comanda

Objetivo: o caixa/financeiro enxergam na comanda o que foi registrado antes, sem duplicar campos nas entidades de origem.

| # | Entrega | Comportamento desejado | Onde mexer (indicativo) |
|---|---------|------------------------|-------------------------|
| A1 | Orçamento → comanda | `hub_quotes.notes` → `hub_comandas.notes` ao `openComanda` / `origin_type: quote` | `hubComandasController` (`buildComandaItemsFromQuote`, insert da comanda) |
| A2 | Agendamento → comanda | `hub_appointments.financial_notes` → `hub_comandas.notes` ao abrir comanda com `origin_type: appointment` | `hubComandasController` (`buildDesiredComandaSnapshot` / insert) |

**Critérios de aceite (rascunho):**
- [ ] Comanda nova a partir de orçamento com `notes` preenchido exibe o texto em “Observação interna do caixa” (somente leitura até edição no caixa, se ainda sem handoff).
- [ ] Comanda nova a partir de agendamento com `financial_notes` preenchido herda o texto em `hub_comandas.notes`.
- [ ] Não sobrescrever `notes` da comanda se o operador já tiver digitado algo antes do save (definir regra: só na criação, não no sync).

---

### Prioridade média — histórico comercial no orçamento

| # | Entrega | Comportamento desejado | Onde mexer (indicativo) |
|---|---------|------------------------|-------------------------|
| B1 | Congelar `hub_quotes.notes` após envio | `PATCH` rejeita alteração de `notes` quando `status !== 'draft'` | `hubQuotesController` |
| B2 | UI orçamento | Campo interno somente leitura após envio; mensagem “histórico da proposta” | `HubQuoteWorkspace`, `HubQuoteDetailLayout` |

**Não** inclui `finance_notes` no orçamento — faturação continua na comanda.

---

### Prioridade baixa — consistência opcional na agenda

| # | Entrega | Comportamento desejado | Notas |
|---|---------|------------------------|-------|
| C1 | Congelar `financial_notes` após comanda criada | Agenda em read-only para notas financeiras se existir comanda ativa para o mesmo `origin` | Avaliar UX (agendamento ainda em edição vs comanda aberta) |
| C2 | Prefixo de origem na comanda | Ao herdar notas, prefixar “Origem: orçamento #…” / “Agendamento …” | Evita ambiguidade quando há várias fontes |

---

## Evolução futura (fora do escopo imediato)

- **Tabela append-only** `hub_document_note_events` (autor, papel, texto, `entity_type`, `entity_id`) para auditoria completa.
- Exibir timeline de notas na ficha da comanda (caixa + financeiro + eventos).
- Propagar `client_notes` de orçamento → agendamento → comanda de forma documentada (hoje só partes disso existem).

---

## Decisão de produto (registro)

> **Notas com handoff entre módulos ficam na comanda.** Orçamento e agendamento mantêm os campos que já têm (`notes` / `client_notes` e `notes` / `financial_notes`) e, pós-MVP, devem **passar contexto** na criação da comanda — não reimplementar o modelo caixa/financeiro nelas.

---

## Links

- Épicos gerais: [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md)
- Modelo financeiro: [HUB_FINANCIAL_MODEL.md](./HUB_FINANCIAL_MODEL.md)
- Orçamentos: [HUB_QUOTES_AND_PROSPECTS.md](./HUB_QUOTES_AND_PROSPECTS.md)
