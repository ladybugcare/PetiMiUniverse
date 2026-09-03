# Família Matilha — Vacinação com estoque no atendimento

Guia operacional para a clínica beta **Família Matilha** (Cotia/SP), alinhado ao fluxo **A + C** do Hub: consulta genérica na agenda + vacina escolhida no atendimento, com baixa automática de estoque e cobrança em duas linhas na comanda.

## Princípio de cobrança

| Linha na comanda | Origem |
|------------------|--------|
| **Consulta** | Serviço agendado na agenda (ex.: Consulta R$ 150) |
| **Vacina** | Item de estoque (`item_kind: vaccine`) aplicado no atendimento |

Não é necessário cadastrar um serviço separado por vacina na agenda. As 8 vacinas ficam apenas no **Estoque → Vacinas**.

## Pré-requisitos (uma vez por clínica)

1. **Catálogo de vacinas no estoque** — itens com `item_kind = vaccine`, preço de venda (`sale_amount`) e SKU/EAN quando aplicável.
2. **Entrada de lote com saldo** — antes da primeira aplicação, registrar entrada em **Estoque → Vacinas** (lote, validade, quantidade). Sem lote com saldo, o atendimento bloqueia a baixa e exibe orientação na UI.
3. **Serviço Consulta na agenda** — usar o serviço **Consulta** já cadastrado para agendamentos de vacinação; o veterinário escolhe qual vacina aplicar durante o atendimento.

## Fluxo no dia a dia

### 1. Agenda

1. Agendar o pet com o serviço **Consulta** (mesmo fluxo de consulta clínica).
2. Não selecionar vacina na agenda — a escolha ocorre no consultório.

### 2. Check-in e atendimento

1. Abrir o atendimento no **Workspace clínico**.
2. Na seção **Vacinas**:
   - **Origem:** *Aplicada na clínica (estoque)* (padrão).
   - **Vacina (estoque):** selecionar o item (ex.: Vacina Raiva).
   - **Lote:** selecionar lote com saldo > 0 e validade adequada.
   - Opcional: próxima dose, observações.
3. Clicar em **Registrar vacina**.
4. O sistema:
   - grava o registro de vacinação no prontuário;
   - baixa **1 dose** do lote (`encounter_out`);
   - preenche `stock_movement_id` e snapshot de **preço** para a comanda.

### 3. Comanda

A comanda do atendimento deve mostrar:

- linha da **consulta** (serviço do agendamento);
- linha da **vacina** com o preço do catálogo de estoque no momento da aplicação.

### 4. Vacina externa / histórico

Se o tutor informou vacina aplicada em outra clínica (sem baixa de estoque):

1. Em **Origem**, escolher *Vacina externa / histórico*.
2. Informar nome da vacina e, se houver, lote/referência.
3. Registrar — **não** há movimentação de estoque nem linha de produto na comanda (salvo política futura de cobrança manual).

## Mensagens comuns na UI

| Situação | O que fazer |
|----------|-------------|
| “Nenhuma vacina no estoque” | Cadastrar vacinas em **Estoque → Vacinas**. |
| “Sem lotes com saldo” | Registrar **entrada de estoque** com lote e quantidade antes de aplicar. |
| “Selecione a vacina e o lote” | Preencher ambos os campos antes de registrar (modo na clínica). |
| Erro de saldo insuficiente (API) | Conferir saldo do lote ou escolher outro lote. |

## Dados da clínica beta (produção)

| Campo | Valor |
|-------|--------|
| Nome | Família Matilha |
| Clinic ID | `c1de9b48-5730-4602-a665-9d9d894aac49` |
| Hub | https://hub.petmi.app |
| Vacinas no estoque | 8 itens (importados do catálogo Matilha) |
| Serviços na agenda | 73 serviços (inclui Consulta; **sem** serviços duplicados por vacina) |

## Migration de banco

Para cobrança correta da vacina na comanda, aplicar no Supabase:

`backend/database_migrations/petimi_hub/095_alter_hub_vaccination_records_price.sql`

Adiciona a coluna `price` em `hub_vaccination_records` (snapshot do `sale_amount` do item no momento da aplicação).

## Referências técnicas

- Regras clínicas gerais: [`docs/clinical-business-rules.md`](../clinical-business-rules.md)
- API: `POST /clinical/vaccinations` com `hub_inventory_item_id`, `hub_inventory_lot_id`, `source`
- Componentes UI: `HubVaccinationForm`, `HubWorkspaceVaccinations`
