# Plano de QA pré-lançamento — Hub Petmi

Leitura do código em **`origin/staging` @ `32aee935`** (26/11/2026). Não houve alteração de aplicativo.

Este repositório **é** o Petmi Hub: frontend em `apps/hub-web` + `packages/hub-ui`, API em `backend/` (Railway). Staging: Hub `https://hub-staging.petmi.app`, API `https://backend-staging-334260f3.up.railway.app`. A feature de snapshot de comissão (migration **171**, `sold_by_staff_id`, `commission_accrued_at`) **não está em `main`** (`093516ba`). O que as clínicas vão usar no lançamento é o que está em `staging`.

Legenda de severidade:

- **Bloqueia o lançamento** — dado errado de dinheiro, cobrança duplicada/perdida, ou privacidade entre pessoas, no fluxo que as duas clínicas vão usar no primeiro dia.
- **Alta** — falha reproduzível que quebra um turno ou um relatório, com contorno operacional ruim.
- **Média** — inconsistência de centavo, rótulo, ou caminho secundário.
- **Baixa** — clareza, observabilidade, teste que ainda não existe.

---

## 1. Como a comissão funciona (mapa)

| Peça | Onde |
| --- | --- |
| Migration do snapshot | `backend/database_migrations/petimi_hub/171_alter_hub_commission_line_snapshot.sql` |
| Regras (cadastro) | `hubCommissionRulesController.ts`, UI `HubCommissionsSection.tsx` |
| Cálculo puro (% / fixo, maior resto) | `hubCommissionCalc.ts`, `allocateLiquidLineAmounts` e `commissionAdjustmentForReturn` em `hubReceivableFinancialBalance.ts` |
| Quem leva a comissão | `resolveServiceExecutorStaff` / `resolveLineStaff` / `accrueCommissionSnapshots` em `hubCommissionAccrual.ts` |
| Gravação na venda | `leavePendingHandoffComanda`, `postHubComandaCheckout` e o recebível avulso em `hubFinancialController.ts` (~linha 1648, único ponto com `allowActingUserAsSaleAuthor: true`) |
| Vendedor do produto | `postHubComandaAddItems` grava `sold_by_staff_id` só em item `product`, via `resolveStaffIdForUser` |
| Relatório gerencial | `buildCommissionsReport` → `GET /api/hub/finance/reports/commissions` (`hub.financial.read`) |
| Minhas comissões | `getHubFinanceMyCommissionsReport` → `onlyStaffId` do usuário logado (`hub.commissions.read_own`) |
| UI | `HubRelatoriosCommissions.tsx`, `HubRelatoriosMyCommissions.tsx`, catálogo em `hubRelatoriosConfig.ts` (`reportAllowed`) |

Regra de atribuição (código, não hipótese):

- **Produto:** usa `hub_comanda_items.sold_by_staff_id`. O abridor do caixa não entra. No handoff e no auto-close, `allowActingUserAsSaleAuthor` é **false** — se o produto não tem `sold_by`, cai em Sem profissional. Só a venda avulsa do financeiro liga o ator.
- **Serviço `appointment_service`:** só `hub_appointment_services.executed_by_staff_id`. O profissional do agendamento (`hub_appointments.hub_staff_member_id`) **não é lido**. Exceção: Leva e Traz (`appointment_kind = pickup_route`) usa o motorista da rota.
- **`grooming_extra`:** sempre `null` (comentário: `created_by` é cadastro, não executor).
- **`clinical_exam`:** sempre `null` (solicitante é proibido).
- **Vacina / medicação / cirurgia / dose de internação:** staff específico da ficha, se existir e pertencer à clínica.
- **Diária de internação, hospedagem, orçamento, manual de serviço:** `null`.
- Staff é aceito se a linha em `hub_staff_members` existe, mesma clínica, `deleted_at` nulo. **Não olha status ativo.** Quem resolve o usuário logado (`resolveStaffIdForUser`) exige `clinic_users.status = active`.
- Linha entra no relatório só com `commission_accrued_at` preenchido. Regra editada depois não regrava o snapshot.

Testes que já existem e devem ser estendidos (hoje vários só afirmam constantes locais, sem I/O):

- `backend/src/modules/hub/__tests__/hubCommissionAttributionRules.test.ts`
- `backend/src/modules/hub/__tests__/hubCommissionAccrual.test.ts`
- `backend/src/modules/hub/__tests__/hubMyCommissionsIsolation.test.ts`
- `backend/src/utils/__tests__/permissions.test.ts`
- `packages/hub-ui/src/pages/finance/hubRelatoriosConfig.test.ts`
- `packages/hub-ui/src/components/billing/DiscountControl` (não há teste do `inferDiscountKindAndValue`)
- `backend/src/modules/hub/__tests__/comandaFinanceHandoff.test.ts`
- `backend/src/modules/hub/__tests__/hubComandaCheckoutMatrix.integration.test.ts`
- `backend/src/modules/hub/__tests__/cashSessionAutoClose.integration.test.ts`
- `backend/src/modules/hub/__tests__/hubComandaOpenTenant.integration.test.ts`
- `backend/src/modules/hub/__tests__/hubTenantIsolationClinical.integration.test.ts`
- `backend/src/modules/hub/__tests__/hubClinicalAppointmentMirror.integration.test.ts`
- `backend/src/modules/hub/__tests__/surgeryComandaMerge.test.ts`
- Playwright: `apps/hub-web/e2e/caixa.spec.ts`, `etapa-a-devolucoes.spec.ts`, `etapa-b-relatorios.spec.ts`, `relatorios.spec.ts`, `qa-consulta-retest.spec.ts`, `agenda.spec.ts`

---

## 2. O que a QA de 26/11 acertou (por que passou)

| Caso | Por que o código faz isso |
| --- | --- |
| A1 produto vai para o vendedor, não para quem abriu o caixa | `sold_by_staff_id` é do usuário que **incluiu** o produto (`postHubComandaAddItems`). `resolveLineStaff` não recebe o opener. |
| A3 outro usuário no checkout mantém o vendedor | Handoff chama `buildCommissionInsertFieldsForItems` com `allowActingUserAsSaleAuthor: false`. |
| B4/B5 editar, desativar ou criar regra só afeta venda futura | Relatório lê `commission_rule_basis/rate/original_amount` congelados. `loadActiveCommissionRules` só roda na apuração. |
| C2 desconto geral rateado no centavo | `allocateLiquidLineAmounts` (floor + maior resto) faz a soma das bases = líquido. |
| C5 devolução total de produto gera ajuste negativo | `buildCommissionsReport` emite linha `Devolução: …` com `commissionSigned = -ajuste` a partir de `hub_product_return_events`. |
| C7 estorno de pagamento sem devolução comercial mantém comissão | Estorno mexe em `hub_payments` / ajuste financeiro. O relatório de comissão **não** lê pagamento; só snapshot + evento de devolução comercial. |
| D5 deixar pendente apura na criação e pagar depois não duplica | `leavePendingHandoffComanda` grava o snapshot uma vez. Se `finance_handoff_at` já existe, o handoff seguinte é `skipped`. Pagamento não chama `accrueCommissionSnapshots` de novo. |
| C10 total da Diana no gerencial = Minhas | Os dois usam `buildCommissionsReport`. Minhas filtra `onlyStaffId`. Se todas as linhas comissionadas dela são as únicas com valor, os totais de **comissão** batem. Vendas podem divergir: o gerencial inclui Sem profissional e Minhas descarta `staff_id` nulo. |

---

## 3. Falhas da QA — causa, reprodução, teste

### F1 — Banho & Tosa sempre em «Sem profissional»

**Severidade: bloqueia o lançamento** se a clínica paga comissão de banho/tosa por este relatório.

**Causa.** `resolveServiceExecutorStaff` para `appointment_service` lê apenas `executed_by_staff_id`. O nome «Profissional» da agenda/fila é `hub_appointments.hub_staff_member_id` / `hub_grooming_sessions.hub_staff_member_id` e não entra na conta.

O único escritor de `executed_by_staff_id` na UI é o checkbox «feito» da gaveta de Banho & Tosa (`GroomingAppointmentDrawer.toggleLineExecuted` → `PATCH /grooming/appointment-service-lines/:lineId`). Ele só aparece quando já existe `session_id`, a gaveta carregou `appointment_lines` e o usuário tem escrita. O id gravado é `item.hub_staff_member_id` da **ficha da fila**, não um seletor por linha. Quem atende pela Agenda, marca o serviço como feito no status do agendamento e cobra no caixa **não passa por esse checkbox**. Resultado: `executed_by_staff_id` fica nulo → `commission_staff_source = none`.

Adicional de banho (`grooming_extra`) é Sem profissional **de propósito** (caso A6).

**Reproduzir no staging.** Agendar Banho com profissional Diana. Concluir pela agenda/fila sem marcar o checkbox de linha. Enviar ao financeiro. Relatório gerencial: linha em Sem profissional, Diana com R$ 0 nesse serviço.

**Testes.**

| Nome | Camada | Setup | Asserção |
| --- | --- | --- | --- |
| `appointment_service sem executed_by não usa o profissional do slot` | integração (`hubCommissionAccrual`) | Serviço de agenda com `hub_staff_member_id = Diana`, `executed_by_staff_id` nulo, regra 10% | Snapshot `staff = null`, `source = none` |
| `checkbox feito grava executed_by da ficha e a comissão sai daí` | integração + Playwright `agenda`/`caixa` | Gaveta B&T, marcar a linha, handoff | `executed_by_staff_id` = staff da ficha; relatório mostra esse nome |
| `fechar sessão sem checkbox mantém Sem profissional` | e2e filtrado | Fluxo real de fila → caixa | Linha no bucket Sem profissional |

### F2 — Um agendamento, uma comanda; não existe comanda mista da visita

**Severidade: média** (comportamento atual, não perda de dinheiro por si). Vira alta se a recepção espera um único pagamento e esquece a segunda comanda.

**Causa.** `postHubComandaOpen` chaveia comanda aberta por `origin_type + origin_id`. Cada agendamento é uma origem. `visit_group_id` agrupa a agenda e o lote de cobrança (`BatchChargeDrawer` / `applyVisitKeysToBatchItems`), mas **não funde** os itens numa comanda. `sumAppointmentServicesSaleForComanda` junta só as linhas `hub_appointment_services` **daquele** appointment. Banho e tosa criados como dois agendamentos geram duas comandas. Dá para cobrar juntas no checkout em lote, ainda como duas cobranças.

**Reproduzir.** Dois serviços no mesmo pet/horário (dois cards na agenda). Abrir comanda de cada um. Caixa mostra duas linhas.

**Teste.** `comanda por appointment, lote por visit_group` — integração: dois appointments com o mesmo `visit_group_id` abrem duas comandas; o batch aceita as duas no mesmo tutor; nenhum item aparece nas duas.

### F3 — Recepção vê o gerencial de todo mundo e não vê «Minhas comissões»

**Severidade: bloqueia o lançamento** se comissão é dado sensível entre sócios/funcionários. É o código, não um redirect quebrado.

**Causa.**

- `CASSISTANT` tem `hub.financial.read` e `hub.reports.read`. Não tem `hub.commissions.read_own` (`backend/src/utils/permissions.ts`).
- Relatório `commissions` exige `hub.financial.read` (`reportAllowed` → `needsFinancialRead`). A rota repete `requirePermission('hub.financial.read')`.
- Relatório `my-commissions` tem `scope: 'self'` e só abre com `hub.commissions.read_own`. Sem a permissão, `HubRelatoriosPage` zera `activeReport` e **renderiza o catálogo** no lugar (a URL `relatorio=my-commissions` pode continuar). Não é um `Navigate` explícito.
- `CADMIN` passa em tudo (`isClinicAdminRole`). Por isso Minhas existe para o admin.
- `CVET_INTERNAL` tem `read_own` e **não** tem `hub.financial.read`: vê Minhas, não vê o gerencial. `CSTAFF` com área `clinica` idem.

**Reproduzir.** Login `qa.staging.a.cassistant@petmi.test`. Abrir Relatórios → Comissões (entra). Abrir `?relatorio=my-commissions` (volta ao catálogo, card Minhas ausente). Repetir com CADMIN (os dois cards) e com veterinário (só Minhas).

**Testes.**

| Nome | Camada | Setup | Asserção |
| --- | --- | --- | --- |
| `CASSISTANT vê gerencial e não vê my-commissions` | unit `permissions.test.ts` + `hubRelatoriosConfig.test.ts` | `hasPermission` / `reportAllowed` | financial true, read_own false; card self oculto |
| `CVET vê só o próprio staff` | integração da rota | Dois staff, query `staff_id` do outro | 200 só com linhas do token; query ignorada; 403 no gerencial |
| `CASSISTANT no gerencial não filtra pelo usuário` | integração | Mesmo período | Payload idêntico ao do CADMIN (mesmo `clinic_id`/`unit_id`) |

Decisão de produto antes do go-live: recepção deve perder `hub.financial.read` nesse relatório, ou o gerencial passa a exigir uma permissão nova (`hub.commissions.read_all`). Não dá para «esconder» só na UI: a API entrega o JSON.

### F4 — Cancelar a comanda não tira a venda do relatório; pode aparecer «Devolução»

**Severidade: alta.**

**Causa (aba Cancelar, `postHubComandaCheckout` action `cancel`).** A comanda vai para `status = cancelada` e a origem ganha `billing_waived_at`. **Não** cria recebível e **não** cancela recebível existente. O guarda «já existe cobrança» usa `fetchActiveReceivableKeys`, que indexa `source_type:source_id` do recebível. O checkout grava `source_type = 'manual'` e `source_id` aleatório. O guarda **não enxerga** a cobrança que o próprio checkout criou. Depois de «Enviar ao financeiro», Cancelar ainda sucede, a comanda some do caixa e o recebível (com snapshot) continua. O relatório de vendas exclui só `hub_receivables.status = cancelled`. A venda permanece.

A palavra **«Devolução:»** no relatório de comissão só é escrita no loop de `hub_product_return_events` (`buildCommissionsReport`). A aba Cancelar **não** insere esse evento. Venda + linha «Devolução» juntos é o desenho da **devolução comercial** (C5), não do cancelamento. Cancelar o recebível (`postHubFinanceReceivableCancel`) marca `cancelled` (sai das vendas) e, se confirmar estoque, grava evento de devolução. O filtro dos eventos de devolução **não** exclui recebível `cancelled` — a linha negativa pode ficar sozinha.

`postHubComandaCheckoutBulk` com `action: 'cancel'` **não tem** o ramo de cancelamento: cai no mesmo insert de recebível do `receive_now`. A UI de uma comanda não chama o bulk com cancel (só `ComandaCheckoutDrawer`). O buraco existe na API.

**Reproduzir.** (1) Comanda aberta, nunca enviada → Cancelar com motivo → relatório sem linha nova. (2) Enviar ao financeiro, depois Cancelar na aba → comanda `cancelada`, recebível `pending`, linha de venda continua. (3) Devolução comercial do produto → venda + «Devolução:».

**Testes.** Estender `hubComandaCheckoutMatrix.integration.test.ts`.

| Nome | Camada | Setup | Asserção |
| --- | --- | --- | --- |
| `cancel de comanda aberta não cria recebível` | integração | action cancel + waive_reason | 0 linhas em `hub_receivable_lines`; comanda `cancelada` |
| `cancel após leave_pending não deixa venda no relatório` | integração | handoff, depois cancel | Recebível `cancelled` **ou** fora de `buildCommissionsReport`; hoje falha — o teste trava o contrato |
| `devolução comercial mantém venda e acrescenta linha negativa` | integração | `hub_product_return_events` | Duas entradas, mesma `line_id` de origem, sinais opostos |
| `bulk action=cancel não cria recebível` | integração | POST checkout-bulk action cancel | 0 recebíveis novos |

### F5 — Diana 9 linhas / R$ 670, João e Maria 10 linhas / R$ 620, comissão R$ 50 nos dois

**Severidade: média** (não é filtro por usuário). Alta se a clínica fechar folha no meio de uma devolução.

**Causa.** O gerencial usa `supabaseAdmin` e **não** recebe o staff do viewer. Dois logins no mesmo `clinic_id`, `unit_id` e período recebem o mesmo JSON.

O delta observado (uma linha a mais, vendas R$ 50 a menos, comissão igual) é a conta de uma linha de devolução de **R$ 50 com comissão 0** (serviço/produto sem regra, típico de Sem profissional): `lines_with_commission` soma venda e devolução; `total_sales` soma a base com sinal; `commissionSigned` do retorno é 0 se `commission_original_amount` é 0. Quem abriu o relatório antes do evento viu 9 / 670; quem abriu depois viu 10 / 620.

Há dois jeitos da **mesma** resposta parecer diferente na tela:

- `by_staff.lines_count` e `by_service.lines_count` **não incrementam** quando `sign === -1`. O KPI «Linhas com comissão» incrementa. Contar o card do profissional ≠ contar o KPI.
- A tabela usa `key={row.line_id}`. Venda e «Devolução» da mesma linha compartilham o id. O React reconcilia as duas como uma. O KPI continua com as duas.

**Testes.**

| Nome | Camada | Setup | Asserção |
| --- | --- | --- | --- |
| `mesmo período, dois papéis, mesmo JSON` | integração | CADMIN e CASSISTANT | `total_sales`, `total_commission`, `items.length` iguais |
| `devolução de linha sem regra: +1 linha, vendas −base, comissão estável` | unit em `buildCommissionsReport` | snapshot comissão 0, base 50, evento de return | 10 vs 9 e 620 vs 670 no exemplo |
| `venda e devolução não compartilham a key da tabela` | componente `HubRelatoriosCommissions` | dois items, mesmo `line_id` | Duas `<tr>` (key composta `line_id + sinal`) |

### F6 — Resumo −R$ 17,32 / R$ 212,68 e pago R$ 17,33 / R$ 212,67

**Severidade: alta** (centavo no que o cliente paga; as clínicas vão notar).

**Causa.** Há dois arredondamentos que não passam pela mesma função:

1. `resolveDiscountAmount` / `inferDiscountKindAndValue` (`DiscountControl.tsx`). Ao reabrir a comanda, um desconto fixo de R$ 17,33 sobre subtotal R$ 230 vira percentual 7,53 se a recomposição cair a menos de R$ 0,01 do valor salvo. `7,53% × 230 = 17,319` → **R$ 17,32**. `handleSendToFinancial` chama `persistComanda()` **antes** do checkout, então pode gravar o percentual reinferido e o recebível nasce com um centavo a menos do que a tela mostrou na hora de digitar.
2. O líquido por linha (`allocateLiquidLineAmounts`) garante soma = `net_amount_at_sale`. O total da comanda é `round2(subtotal − discount_amount)`, conta independente. Resumo (cabeçalho) e «pago» (recebível / pagamento) divergem R$ 0,01 quando o desconto foi regravado entre uma tela e outra.

**Reproduzir.** Subtotal que não fecha redondo (ex.: R$ 230,00), desconto fixo R$ 17,33. Salvar, sair, reabrir (o controle pode voltar como %). Enviar ao financeiro. Comparar resumo, `hub_receivables.final_amount` e valor pago.

**Teste.** Unit de `inferDiscountKindAndValue`: para uma grade de subtotais × descontos em centavos, `resolve(infer(d)) === d`. Integração: após leave_pending, `discount_amount` da comanda, `net_amount_at_sale` e soma das `commission_basis_amount` são o mesmo centavo.

### F7 — Primeiro «Enviar ao financeiro» não faz nada e desabilita os botões

**Severidade: alta** no caixa (a recepção cobra o dia inteiro por aqui).

**Causa mais aderente ao «botões desabilitados».** No day board, `HubCaixaPage.onSendToFinanceiro` faz `setDayBoardBusy(true)` na hora. `FinanceDayBoardTable` desabilita **todas** as ações da tabela com `disabled={busy}`. O handler **não lê** `partial_errors` do `checkoutBulk`. O backend responde **207** quando uma comanda do lote falha e as outras seguem; o cliente trata 207 como sucesso e mostra «Enviado ao financeiro como pendente.» A comanda com erro continua aberta. A primeira tentativa parece muda (botões mortos durante o request, toast de sucesso, linha ainda lá). A segunda passa se o erro era transitório (sync, lote, comanda ainda abrindo).

Na ficha da comanda, `handleSendToFinancial` só abre `showConfirm`. O POST ocorre no «Confirmar». Um clique no botão, sem confirmar o modal, não envia e não deveria desabilitar — se a QA estava na ficha, o sintoma de botão desabilitado aponta para o day board, não para este modal.

`leave_pending` **não** manda `idempotency_key` (D3). Duas requisições paralelas passam as duas pelo `if (comanda.finance_handoff_at)` antes do update. Dá para criar dois recebíveis. O pagamento (`receive_now`) tem chave; o handoff não.

**Testes.**

| Nome | Camada | Setup | Asserção |
| --- | --- | --- | --- |
| `207 do bulk não mostra sucesso total` | componente / e2e `caixa.spec.ts` | Uma comanda com erro de lote, outra ok | Toast lista o erro; botões voltam; a comanda ruim continua acionável |
| `duplo clique em leave_pending cria um recebível` | integração | Dois POST simultâneos | Um `hub_receivables`; o segundo `skipped` ou 409 |
| `confirmar é que dispara o handoff da ficha` | e2e | Clique único sem confirmar | 0 recebíveis |

### F8 — Taxa exibida como `percent_of_sale` / `fixed_per_sale`

**Severidade: baixa** (não erra o valor).

**Causa.** `HubRelatoriosCommissions` (e o CSV em `makeReportExporters`) imprime `row.basis` cru. O cadastro em `HubCommissionsSection` já tem rótulo («sobre o valor do item» / valor fixo). O relatório não reutiliza esse mapa. A migration 171 grava o enum de propósito.

**Teste.** Componente: basis `percent_of_sale` rate 10 renderiza «10%»; `fixed_per_sale` rate 5 renderiza «R$ 5,00». CSV usa o mesmo rótulo.

### F9 — Fechar o caixa quebra com «Lote não pertence ao item de estoque selecionado» e a lista não cancela a comanda

**Severidade: bloqueia o lançamento** (um produto impede encerrar o turno).

**Causa.** `validateLotStockForOut` (`hubInventoryStockUtils.ts`) devolve essa frase quando `hub_inventory_lots.item_id` ≠ `hub_inventory_item_id` da linha. `leavePendingHandoffComanda` chama `createSaleStockOut` e, no erro, faz rollback do recebível e devolve a frase. `leavePendingHandoffOpenComandasForUnit` junta `"{id}: {erro}"` se não for erro «não há itens». `EncerrarTurnoDrawer.handleClose` chama `enviarPendentesAoFinanceiro` **antes** de fechar e **aborta** se `success` é false. O turno fica aberto.

Na lista do caixa (`FinanceDayBoardTable`) não há «Cancelar comanda». O ban é «Marcar sem cobrança» e só com `hub.financial.write` — **CASSISTANT não tem**. «Cancelar recebível» só existe quando já há recebível; o handoff falho não deixou recebível (houve rollback). A recepção não destrava o turno pela lista. Dá para abrir a comanda e usar a aba Cancelar, se alguém souber.

O lote pode ficar trocado se o produto foi editado, o lote reatribuído a outro item, ou a linha foi sincronizada com `hub_inventory_lot_id` de outra vacina/produto.

**Reproduzir.** Comanda aberta com produto cujo lote aponta para outro `item_id`. Encerrar turno. Esperar a mensagem e o caixa ainda `open`. Na lista, nenhum cancelar para o perfil recepção.

**Testes.** Estender `comandaStockOut.test.ts` e `caixa.spec.ts`.

| Nome | Camada | Setup | Asserção |
| --- | --- | --- | --- |
| `lote de outro item falha o handoff e não cria recebível` | integração | lot.item_id ≠ linha | Erro com a frase; 0 movements; 0 receivables |
| `encerrar turno com uma comanda inválida não fecha a sessão` | integração `closeCashSession` via o fluxo da UI | erro não-skippable | `hub_cash_sessions.status` continua `open` |
| `recepção consegue tirar a comanda do turno` | e2e CASSISTANT | lote inválido | Existe ação Cancelar comanda (ou corrigir lote) sem `hub.financial.write` |

### F10 — Antes da migration, tudo cai em Sem profissional; health não mostra SHA nem versão

**Severidade: bloqueia o lançamento** operacional (deploy mudo).

**Causa.** `buildCommissionsReport` descarta linha com `commission_accrued_at` nulo. Sem a 171, a coluna não existe: o select de `hubReportCommercialNet.ts` (`SALE_LINE_SELECT`) quebra ou volta tudo nulo, e o relatório fica vazio / Sem profissional sem erro de produto. `snapshotToInsertFields` manda as colunas novas no INSERT — checkout passa a 500 se o PostgREST não conhece a coluna, ou «funciona» sem snapshot se o erro for engolido no caminho antigo.

Health hoje:

- `GET /` em `backend/src/app.ts` (~237) responde `status: healthy` + timestamp. **Sem SHA, sem migration.**
- `GET /health/live` responde `{ status: 'ok', service: 'petivet-api' }`.
- `GET /health` não tem handler (o router em `routes/health.ts` só monta `/system`, autenticado e restrito a `user_metadata.role === 'admin'`). **404**, como a QA viu.
- `GET /api/hub/health` responde `{ ok, product: 'hub' }` sem versão.

**Teste.** Depois do deploy de staging, `GET /` (ou `/health/live`) inclui `commit` igual ao SHA do Railway e `schema_migration` ≥ `171_alter_hub_commission_line_snapshot`. Script de gate: se o SHA do health ≠ SHA esperado, **parar** (já é a regra do `hub-staging-api-deploy.sh`).

---

## 4. Casos do plano ainda não executados

| ID | O que o código faz hoje | Teste a escrever | Severidade se falhar |
| --- | --- | --- | --- |
| A6 | `grooming_extra` retorna `null` mesmo com `created_by_staff_id` | Integração: extra criado pela Diana, checkout → Sem profissional, comissão da regra ainda calculada (valor sem dono) | média (regra de produto; confirmar com o sócio) |
| A7 | `clinical_exam` ignora solicitante | Integração: exame com `requested_by` ≠ executor → `source = none` | média |
| A9 | Produto sem `sold_by` no auto-close/handoff **não** herda o ator. Venda avulsa no financeiro (`hubFinancialController` ~1648) herda | Integração: produto manual sem staff (usuário sem `hub_staff_members`) → none; quick sale com staff ativo → `sale_author` | alta |
| A10 | Convidado sem vínculo `clinic_users` ativo + `hub_staff_members` → `resolveStaffIdForUser` null | Integração: usuário convidado vende produto → Sem profissional; não vaza staff de outra clínica | alta |
| A11 | Snapshot não é regravado. Relatório busca nome **sem** filtrar `deleted_at` nem status | Integração: inativar/soft-delete o staff depois da venda; linha antiga mantém id e nome; venda nova com staff deletado cai em none (`assertStaffInClinic`) | média |
| C6 | `commissionAdjustmentForReturn` é proporcional e teto 1× a original. O teste atual só soma dois retornos de 50% e aceita `<= original` — **não** prova o teto acumulado no banco (cada evento recalcula sobre a original cheia, não sobre o saldo) | Integração: duas devoluções parciais da mesma linha; soma dos ajustes ≤ original; a segunda não zera de novo os 100% | **alta** (pode pagar comissão negativa demais) |
| C8 | Estorno financeiro sem evento comercial não muda comissão (igual C7) | Integração: `hub_financial_adjustments` refund, zero `hub_product_return_events` → comissão idêntica | média |
| C9 | Devolução + estorno juntos: comissão só reage ao evento comercial | Integração: os dois no mesmo recebível; delta de comissão = só o ajuste da devolução | alta |
| D3 | Pagamento tem `idempotency_key`. Handoff não | Ver F7 | alta |
| D6 | `runAutoCloseOverdueJob` fecha sessão com `opened_at` em dia civil **America/Sao_Paulo** anterior. `abortOnHandoffErrors: true`. Um lote inválido **impede** o fechamento da meia-noite (diferente do close manual da API, que engole o erro; a UI manual também aborta) | Integração com relógio fixo 00:05 SP: sessão de ontem fecha; sessão de hoje não; lote inválido → `status: error` e sessão `open` | **bloqueia** se o job estiver ligado |
| D7/D8 | Linha com `commission_accrued_at` null fica fora. Recebível antigo não é backfill | Integração: recebível pré-171 no período + recebível novo; só o novo entra; total de vendas do relatório ≠ faturamento antigo | alta (explicar às clínicas: histórico não aparece) |
| E2 | `requirePermission` chama `checkPermission(user, clinic_id)` do query. Relatório não tem um segundo filtro | Integração já esboçada em `hubComandaOpenTenant` / `hub-tenant-isolation-smoke.ts`: token da clínica B com `clinic_id` da A → 403 no gerencial, em Minhas, no checkout e no prontuário | **bloqueia** |

**C6 em detalhe.** `commissionAdjustmentForReturn` aplica `min(1, devolvido/base) * original` **por evento**, sem olhar ajustes anteriores. Dois eventos de 60% geram 120% se o relatório soma os dois. O teste unitário atual não cobre isso. Tratar como bug até o código descontar o já ajustado.

---

## 5. Fluxo operacional — o que exercitar de ponta a ponta

Papéis mínimos em cada clínica: CADMIN, CASSISTANT (recepção), veterinário (`CSTAFF`+área clinica ou `CVET_INTERNAL`), e um banho/tosa se a clínica usa a fila. Duas unidades se existir A1/A2. Caixa aberto na unidade do teste.

Ordem sugerida (um pet «QA Lançamento», tutor real de teste):

1. **Agenda.** Consulta + banho no mesmo tutor, horários seguidos. Confirmar profissional em cada card. Recarregar a agenda e o painel do dia: status e profissional iguais nos dois lugares.
2. **Banho.** Check-in, fila, checkbox «feito» numa linha e a outra sem checkbox. Adicional no meio (hidratação). Fechar a sessão.
3. **Consulta.** Abrir encontro a partir da agenda (não criar um segundo pelo botão solto). Registrar exame com preço, medicação aplicada na clínica, medicamento de uso em casa, produto de estoque com lote. Internação curta ou cirurgia só se a clínica for usar na primeira semana — se for, é bloqueante testar o espelho (seção 7).
4. **Comanda.** Uma por origem. Conferir itens: serviço da agenda, adicional, exame, aplicação, produto. Uso em casa **não** entra (`administration === 'home_use'`). Nada de linha R$ 0 fantasma além do fallback «Consulta / atendimento clínico» quando o encontro não tem item cobrável — esse fallback existe em `buildComandaItemsFromEncounter` e zera o subtotal. Não pode duplicar a consulta da agenda.
5. **Desconto** fixo com centavos (F6). Salvar, reabrir, enviar ao financeiro.
6. **Checkout.** Uma comanda «Deixar pendente» e pagar depois no financeiro (D5: comissão não dobra). Outra «Receber agora» em dinheiro com caixa aberto, por um usuário que não foi o vendedor (A3).
7. **Caixa.** Sangria pequena. Encerrar turno com **todas** as comandas válidas (caminho feliz) e, em outro turno, com o lote inválido (F9).
8. **Financeiro.** Recebível pendente, pagamento parcial, devolução parcial de produto (C6), estorno sem devolução (C7/C8).
9. **Relatórios** no mesmo dia civil de São Paulo, CADMIN e recepção e vet: comissões, Minhas, vendas e acertos, não faturados, fluxo de caixa. Exportar CSV e ler a coluna da taxa (F8).

Playwright existente para estender, sempre com `-g` durante o conserto: `caixa.spec.ts`, `etapa-a-devolucoes.spec.ts`, `etapa-b-relatorios.spec.ts`, `qa-consulta-retest.spec.ts`. Regressão completa só no gate, com o SHA do health igual ao deploy.

---

## 6. Cobrança — perdas, duplicatas, desconto, cancelamento

Sincronismo: `applySyncComandaFromOrigin` apaga os itens **abertos que não são `origin_type = manual`** e reinsere o snapshot. Item lançado na mão no caixa sobrevive. Item que já virou recebível não é recriado (chave `origin_type:origin_id` faturada).

| Risco | Onde | O que a QA deve ver | Severidade |
| --- | --- | --- | --- |
| Segunda comanda com os mesmos serviços da agenda depois que a primeira já foi fechada/faturada | `syncOpenComandasAfterEncounterCompleted`: se não há comanda **aberta**, chama `ensureOpenComandaForCompletedEncounter`. O guarda usa `fetchActiveReceivableKeys` (`source_type:source_id`). O checkout gravou `manual`+UUID, então o guarda não vê a cobrança. O snapshot do encontro **inclui de novo** os `appointment_service` | Concluir a consulta depois de ter enviado a comanda da agenda. Não pode nascer outra comanda com a mesma consulta | **bloqueia** |
| Adicional de banho fora da comanda já aberta | `postHubGroomingSessionExtra` não sincroniza. `syncOpenComandasAfterGroomingClosed` só roda ao fechar a sessão (`hubGroomingController` ~1105 e ~1267). Checkout não relê a origem se a comanda já tem itens | Adicional depois da comanda aberta, cobrar antes de fechar a sessão: o adicional falta. Fechar a sessão depois do handoff: o adicional entra como item aberto **fora** do recebível já gerado | **alta** |
| Exame/medicação some sem erro | Vários `void syncOpenComandasAfterEncounterChargeableChange`. O `catch` só faz `console.error`. A API do exame responde 200 mesmo se a comanda não atualizou | Incluir exame com a comanda aberta, não recarregar «na sorte»: o item está lá ao abrir a comanda em seguida. Se não estiver, é bug | **alta** |
| Corrida de dois syncs | `applySync` dá `delete` nos abertos e `insert` sem trava | Dois exames salvos juntos: cada um uma vez, nunca duas vezes | **alta** |
| Exame sem tipo de serviço | Linha de exame não preenche `hub_service_type_id`. Não casa regra de comissão por serviço e não entra no «por serviço» | Exame cobrado no total da comanda; comissão Sem profissional (A7), a menos que exista regra por outro critério — hoje não existe | média |
| Preço 0 | Vacina/exame/aplicação entram mesmo com preço 0. Grupo com subtotal ≤ R$ 0,01 é pulado no checkout | Item de verdade com preço esquecido não pode sumir calado: a comanda mostra R$ 0 e o caixa percebe | média |
| Consulta R$ 0 + cirurgia | `mergeSurgeryServicesIntoComandaItems` tenta tirar o espelho. Há teste em `surgeryComandaMerge.test.ts` | Cirurgia confirmada: uma linha, valor da cirurgia, sem «Consulta R$ 0» somando | alta se a clínica opera cirurgia |
| Diária substituindo o slot da agenda | `dropAppointmentLinesReplacedByHospitalization` | Internar a partir da consulta: a diária entra, o slot de «internação» da agenda não cobra de novo | **bloqueia** se forem internar na primeira semana |
| Cancelar ≠ devolver | Seção F4 | Cancelar comanda não faturada: some. Cancelar depois do financeiro: recebível também some do relatório. Devolver produto: venda + linha negativa, comissão proporcional, teto na original (C6) | alta |
| Desconto | F6 | Resumo, recebível e pagamento no mesmo centavo | alta |
| Pacote | `redeemPackageBalancesOnCheckout` no handoff | Cobertura total não gera recebível cheio e não fecha a comanda antes do resgate (`tryAutoCloseComanda`) | alta se usam pacote |

Teste de integração âncora (novo arquivo ao lado de `hubComandasAppointmentSync.integration.test.ts`): «encontro concluído após comanda da agenda já faturada não cria segunda comanda com os mesmos `appointment_service`».

---

## 7. Clínica e Agenda — duas fontes

O espelho está em `hubClinicalAppointmentMirror.ts` (`insertLinkedClinicalAppointment`): cirurgia e internação criadas no consultório ganham um slot na agenda + uma linha de serviço. O comentário do arquivo diz que o vínculo nasce da ficha para o slot para não duplicar ficha. O caminho inverso (agenda → encontro) é `openFromAppointment` no cockpit (`HubVetCockpitPage`, `HubClinicEncountersPage`, `HubAgendaPage`).

Conflitos para caçar na QA:

| Situação | Por que preocupa | Como testar |
| --- | --- | --- |
| Consulta marcada na agenda e outro encontro avulso no mesmo pet | Dois prontuários, duas comandas | Abrir pela agenda. O encontro tem `hub_appointment_id`. Não criar outro em «novo atendimento» para o mesmo horário |
| Status | Agenda: `done`/`paid`. Encontro: `completed`. Banho: `grooming_stage = closed`. Internação: `discharged`/`death`/`transferred`. O day board usa `isOriginOperationallyComplete` com essa tabela | Concluir num lugar e ver o outro e o caixa. Status que não está na lista deixa a comanda «incompleta» e o caixa recusa encerrar (`409` «Aguarde a conclusão do serviço») |
| Profissional | Agenda tem staff; comissão de serviço não usa esse campo (F1). Espelho clínico grava `hub_staff_member_id` do vet | O slot espelhado mostra o vet. A comissão da diária continua Sem profissional (origem `hospitalization_daily` retorna null de propósito) |
| Órfão | Espelho best-effort retorna null se não há tipo de serviço ativo no grupo (`required` false). A internação existe e a agenda não | Cadastrar ao menos um serviço ativo em Internação e em Cirurgia **antes** do go-live. Sem isso o espelho falha calado |
| Comanda da agenda já fechada + concluir encontro | Seção 6, cobrança dupla | Teste bloqueante |
| Permissão | CASSISTANT: agenda (`hub.appointments.write`), caixa, **sem** `hub.clinic.write`. Vet: prontuário, **sem** `hub.financial.read` (não cobra e não vê comissão dos outros). CADMIN: os dois. Recepção não registra exame; vet não estorna pagamento (`hub.payments.reverse` é CFINANCE/CADMIN) | Matriz de 15 minutos: cada um tenta o que não é seu e leva 403, sem dado pela metade |
| Isolamento | `requirePermission` checa o `clinic_id` do request. Testes: `hubTenantIsolationClinical.integration.test.ts`, `hubComandaOpenTenant.integration.test.ts` | Token da clínica A não lê encontro, comanda, relatório nem comissão da B (E2) |

Teste de componente/integração já existente para estender: `hubClinicalAppointmentMirror.integration.test.ts`. Acrescentar: «sem serviço ativo de internação, a admissão não cria slot e a API avisa» quando `required`; «concluir encontro não duplica comanda faturada».

---

## 8. Outros furos de lançamento

| Tema | Achado | Severidade |
| --- | --- | --- |
| Fuso | Período padrão do relatório (`parsePeriodQuery`, sem `from`/`to`) usa `ymdTodayUtc()`. O fechamento de caixa usa `ymdSaoPaulo()`. Entre 21h e 00h no Brasil, «hoje» do relatório é o dia UTC seguinte e deixa a venda da noite de fora. `handleSendToFinancial` grava vencimento com `toISOString().slice(0, 10)` — também UTC | **alta** |
| Idempotência | Pagamento sim, handoff não (D3 / F7). Sync sem trava (seção 6) | alta |
| Migration em runtime | Vários SELECTs engolem `does not exist` / `schema cache` e seguem com lista vazia (`hubFinancialController` em ajustes e devoluções). O sintoma é «não tem comissão / não tem devolução», não um 500 | alta |
| Tenant | O middleware existe. Falta o teste E2 no relatório de comissão especificamente | bloqueia até o teste passar |
| Papel recepção × folha | F3 | bloqueia até decidir |
| Health | F10 | bloqueia o processo de deploy |
| C6 teto | Ajuste de devolução não acumula saldo | alta |
| Bulk cancel | API cria recebível se alguém mandar `action: cancel` no lote | média (UI não chama) |
| Relógio do auto-close | D6 + F9: um lote ruim segura o job com `abortOnHandoffErrors: true` | alta |

---

## 9. Checklist antes das duas clínicas entrarem

Ordem obrigatória. Parar no primeiro não.

1. **Deploy.** API de staging no SHA combinado (`hub-staging-api-deploy.sh deploy <sha>`). Health novo tem que mostrar esse SHA e a migration aplicada ≥ 171. Enquanto `GET /` não mostra SHA e `GET /health` é 404, alguém confirma no Railway e no SQL (`schema_migrations` / tabela de controle que o projeto usa) e anota no chamado. Sem isso, não cobrar comissão por este relatório.
2. **E2.** Usuário da clínica A não lê comanda, encontro, caixa nem `reports/commissions` da clínica B. Os smokes `hub-tenant-isolation-smoke.ts` e `hubTenantIsolationClinical` verdes nesse SHA.
3. **Dinheiro não duplica.** Concluir a consulta depois da comanda da agenda já enviada ao financeiro não cria segunda cobrança dos mesmos serviços. Cirurgia e internação, se forem usadas na semana 1, não somam o espelho da agenda com a diária/cirurgia.
4. **Dinheiro não some.** Exame, medicação aplicada e adicional de banho feitos com a comanda já aberta aparecem nela antes do checkout, sem precisar «dar sorte» de recarregar. Uso em casa não entra.
5. **Centavo.** Desconto com não-redondo: resumo = recebível = pagamento. Duas devoluções parciais não passam da comissão original.
6. **Turno.** Encerrar o caixa com comandas limpas fecha. Uma comanda com lote inválido ou não trava o turno sem ação da recepção (cancelar/corrigir lote na lista), ou o lote é corrigido antes e a clínica sabe o procedimento. CASSISTANT consegue a ação.
7. **Comissão.** Produto fica com quem lançou, inclusive se outra pessoa cobra. Banho/tosa: ou o profissional da agenda passa a valer, ou a clínica marca o checkbox «feito» e o relatório é lido sabendo que o resto cai em Sem profissional. Combinar com os sócios **antes** de pagar qualquer um por esse número.
8. **Quem vê a folha.** Recepção não vê a comissão dos outros, ou os sócios aceitam por escrito que `CASSISTANT` vê o gerencial. Vet vê só Minhas e não o gerencial.
9. **Cancelar.** Comanda cancelada antes do financeiro não aparece. Comanda cancelada depois não permanece como venda. Devolução de produto aparece como venda + linha negativa. Estorno de pagamento sozinho não mexe na comissão.
10. **Fuso.** Depois das 21h no Brasil, «hoje» no relatório e o vencimento do «Enviar ao financeiro» ainda são o dia de São Paulo.
11. **Papéis.** A matriz da seção 7 (recepção não grava prontuário; vet não estorna; admin faz os dois) conferida nas duas clínicas, com os usuários reais delas, não só com `qa.staging.*`.
12. **Histórico.** Recebíveis de antes da 171 não entram na comissão. Avisar a clínica para não comparar o relatório com o faturamento antigo.

Só depois disso: regressão Playwright ampla (`test:etapa-a` / `test:etapa-b`) no SHA que o health confirmar. Durante o conserto, só o spec filtrado do bug.
