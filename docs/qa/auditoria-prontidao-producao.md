# Auditoria de prontidão para produção — PetMi Hub

**Data:** 27 de novembro de 2026
**Base:** `main` em `63229b61` (`feat(hub): cancelamento operacional, lote vencido, série/agenda e caixa`). Esse commit já mexe em lote, série e caixa; os achados abaixo são o que continua aberto nele.
**Escopo:** leitura do código (UI em `packages/hub-ui`, API em `backend/src/modules/hub`, migrações em `backend/database_migrations/petimi_hub`, permissões em `packages/web-core` e `backend/src/utils/permissions.ts`).
**Natureza:** análise. Nenhum código de produto, teste, migração ou configuração foi alterado. Não houve deploy nem acesso a produção (`hub.petmi.app`) ou a banco.

**Veredito: NO-GO** para uma clínica ou pet shop desligar o sistema atual e operar só no Hub. O ledger de pagamento (lançar, estornar, não apagar histórico) está mais maduro do que a operação do dia e do que os números que a tela mostra. O que impede a troca é a combinação de: caixa que não atravessa a meia-noite com segurança, série recorrente com Leva e Traz que se corrompe, vacina que fatura sem baixar estoque, e o mesmo “quanto entrou / quanto falta receber” calculado de formas diferentes no Caixa, no Dashboard e nos Relatórios.

Um piloto assistido, com o sistema antigo ainda aberto e uma pessoa do time acompanhando fechamento e conferência, é possível só com as condições da seção 7.

---

## 1. Resumo executivo

Pergunta central: se a clínica ou o pet shop largar o sistema de hoje e ficar só com o PetMi Hub, o que para a operação ou tira a confiança nos números?

**O que pode parar o dia**

- O turno atravessa a meia-noite e o operador não consegue abrir o caixa de hoje enquanto o de ontem segue `open`. O aviso usa um critério de “dia” e o fechamento automático usa outro (fuso de São Paulo). No painel do Caixa não há como marcar a execução do serviço; o handoff para o financeiro recusa a comanda com “Marque a execução do serviço antes de cobrar”; “Marcar sem cobrança” só aparece em parte das linhas. O botão de fechar fica em “Fechando caixa…” porque o sucesso não desliga o estado de espera, e o handoff roda duas vezes.
- O checkout manda `cash_session_id` também em PIX e cartão. Se a sessão já fechou (manual ou job), esses meios falham com 409, embora a regra de negócio diga que só dinheiro exige gaveta aberta.
- Editar uma série (“Este e os futuros” / “Toda a série”) com Leva e Traz regrava o serviço do formulário em todo agendamento da série que não seja perna de transporte, inclusive bloco extra. As pernas de Leva e Traz não são recriadas. O resultado observado no QA (vários Banhos no dia editado e só transporte nos outros dias) é compatível com esse caminho, somado ao horário gravado em UTC.
- Encaixe clínico e walk-in de Banho e Tosa inserem um atendimento novo sem olhar se o pet já está na fila.

**O que tira a confiança no número**

- Vacina aplicada na clínica sem lote entra na comanda e não gera movimento de estoque. A própria tela avisa isso. Estoque fica inflado, custo da dose não entra na margem, e a mesma dose pode ser “aplicada” de novo.
- O relatório Pagamentos pendentes soma `final_amount` (valor cheio da cobrança). Pagamento parcial e reembolso de linha não reduzem o total. O Financeiro e o aging usam o saldo líquido. Quem cobra em atraso por esse relatório cobra valor a mais.
- O Dashboard de hoje (`day-ops-summary`) calcula “a receber” e “recebido hoje” com outra fórmula, inclui recebível sem unidade e corta o dia em UTC, não em America/Sao_Paulo. Entre 21h e meia-noite no Brasil, o pagamento cai no dia seguinte do relatório.
- Na mesma visão financeira, “Recebimentos” é a soma bruta dos pagamentos `posted`, o ticket médio é a cobrança (`net_amount_at_sale`) e o top de serviços é `line_total` sem devolução. Taxa de maquininha fica no snapshot do pagamento e não reduz nenhum desses totais. O CSV ainda chama o recebimento de “Faturamento recebido”.

**O que o código já segura (não tratar como buraco)**

- Pagamento de produção passa pela RPC `hub_post_payment`, com chave de idempotência e teto contra pagamento acima do saldo (`netPaidEffective`).
- Estorno não apaga o pagamento: `posted` vira `reversed`. “Anular lançamento” grava `payment_reversal`; “Reembolso efetivo” grava `refund`. Sessão de caixa já fechada não é reaberta; o ajuste vai para `hub_cash_session_post_close_adjustments`. A sangria em dobro na devolução total em dinheiro foi tratada (migração 172 e o ledger).
- Item de comanda que já virou linha de recebível não pode ser editado (409).
- Isolamento por `clinic_id` nos fluxos que a auditoria de 13–16/11/2026 chamou de H1–H6 está no código atual (pet, prescrição, exame, internação, leito, crédito do tutor, hotel). Promover a si mesmo a administrador da clínica exige `hub.staff.roles.assign`.
- CPF/CNPJ de tutor passa no dígito verificador. `123` não é aceito nesse cadastro.

Contagem: **3 P0, 6 P1, 8 P2, 3 P3** (20 achados). Os seis itens do QA manual estão todos endereçados abaixo; o CPF `123` no tutor foi **refutado**.

---

## 2. Metodologia e escopo

### O que foi feito

Rastreamento estático ponta a ponta: tela → cliente HTTP → controller → serviço/RPC → tabela/migração, e leitura dos testes que cobrem ou deixam de cobrir o caminho. As seis pistas do QA de staging foram usadas como hipótese e confrontadas com o código; o relatório não se limita a elas.

Módulos lidos com prioridade: caixa e ledger (`hubFinancialController.ts`, `hubFinanceLedger.ts`, `cashSessionCloseService.ts`), comandas (`hubComandasController.ts`), dashboard do dia (`hubDayOpsSummaryController.ts`), relatórios da UI financeira, comissão (`hubCommissionCalc.ts`, `hubCommissionAccrual.ts`), agenda e série (`hubAppointmentsController.ts`, `hubSeriesSchedulePatch.ts`), Leva e Traz, vacinação e estoque, encaixe, permissões, recebíveis e migrações 035, 040, 150, 159–166, 172, 174, 177.

### O que não foi feito

- Não se executou a suíte (Vitest/Playwright) e não se chamou staging nem produção. Cobertura abaixo é leitura dos arquivos de teste, não um run.
- Não se auditou pixel a pixel hotel/creche, PDF de relatório, WhatsApp, Mercado Pago ao vivo, assinatura PetMi (além do trava `read_history`) nem o app legado em `frontend/src` fora do Hub.
- Não se provou corrida com duas requisições simultâneas; onde o código não tem transação ou lock, o risco está marcado como potencial.
- Números de linha referem-se à árvore lida nesta data. Um commit posterior pode deslocá-los; o nome do símbolo continua sendo a âncora.

### Critério de severidade

| Nível | Significado usado aqui |
| --- | --- |
| P0 | Perda financeira, corrupção de dado, falha de segurança ou inconsistência que muda o número em que a clínica confia |
| P1 | Trava a adoção: o dia a dia para ou o operador não consegue concluir o fluxo sem gambiarra |
| P2 | Risco operacional com contorno aceitável no curto prazo |
| P3 | Melhoria; não bloqueia a abertura |

Status: **BUG CONFIRMADO** quando o caminho está no código e explica o sintoma. **RISCO POTENCIAL** quando falta trava (transação, lock, filtro) mas não há prova de ocorrência. **REFUTADO** quando o código impede o sintoma relatado.

---

## 3. Achados

### P0

#### P0-01 — Vacina na clínica sem lote entra na comanda e não baixa o estoque

| | |
| --- | --- |
| Módulo | Clínica / estoque / comanda |
| Status | BUG CONFIRMADO |
| Pista de QA | Item 2 (lote em branco fatura e não movimenta) |

**Evidência.** A baixa só acontece se a origem é `in_clinic` **e** há item **e** lote. Sem lote, o registro é gravado com preço e `stock_movement_id` nulo. O teste de integração documenta esse comportamento como permitido.

```927:952:backend/src/modules/hub/hubClinicalModulesController.ts
  if (b.source === 'in_clinic' && b.hub_inventory_item_id && b.hub_inventory_lot_id) {
    const movement = await createEncounterStockOut({
      clinicId: b.clinic_id,
      itemId: b.hub_inventory_item_id,
      lotId: b.hub_inventory_lot_id,
      qty: 1,
      // ...
    });
```

A tela incentiva o atalho:

```164:167:packages/hub-ui/src/components/clinical/HubVaccinationForm.tsx
              Nenhum lote com saldo. Pode registrar sem baixa — o item entra na comanda do mesmo jeito.
```

No checkout, linha de produto sem lote é ignorada na saída de estoque (`hubComandasController.ts`, por volta das linhas 4117–4119: `if (!invItemId || !invLotId) continue`). Origem vacina também é pulada no `sale_out` para não baixar duas vezes — o que está certo quando a baixa já ocorreu no atendimento, e deixa o furo quando a baixa nunca ocorreu.

**Reprodução.** Registrar vacina `in_clinic` com item de estoque e lote vazio. Abrir a comanda do atendimento e receber. Conferir `hub_inventory` / saldo do lote e a linha do recebível.

**Esperado.** Lote obrigatório para vacina de estoque, ou cobrança bloqueada até haver lote. Estoque e comanda andam juntos.

**Atual.** Cobrança segue. Saldo não muda. Não há alerta de consumo.

**Impacto.** Financeiro e de estoque. Custo da dose não entra na margem (`unit_cost_amount` depende da baixa/snapshot). O estoque mente para cima. A clínica pode aplicar e cobrar doses que o sistema ainda mostra na prateleira. Não é vazamento entre clínicas; é a operação interna ficar sem controle de imunobiológico.

**Correção.** Exigir `hub_inventory_lot_id` quando `source = in_clinic` e o item é de estoque, na API e no formulário. Remover o texto que autoriza “registrar sem baixa”. No checkout, recusar `sale_out` / faturamento de linha de vacina com item e sem lote, em vez de `continue`. Teste: vacina sem lote → 400; com lote vencido → 400; com lote válido → um movimento e uma linha de comanda.

---

#### P0-02 — Editar série (“Este e os futuros” / “Toda a série”) com Leva e Traz corrompe os dias

| | |
| --- | --- |
| Módulo | Agenda / Leva e Traz / cobrança da série |
| Status | BUG CONFIRMADO (corrupção da série). O desenho exato “3 Banhos + só transporte” é a consequência desse caminho, não um segundo bug solto. |
| Pista de QA | Item 3 |

**Evidência.** No escopo diferente de `this`, o patch carrega **todos** os `hub_appointments` da `series_id`, sem filtrar `parent_appointment_id` nem descartar bloco extra.

```3307:3325:backend/src/modules/hub/hubAppointmentsController.ts
    const seriesId = (existing as Record<string, unknown>).series_id as string | null;
    if (seriesId && scope !== 'this') {
      let q = supabaseAdmin
        .from('hub_appointments')
        .select('id, starts_at, ends_at, series_occurrence_date, appointment_kind')
        .eq('clinic_id', b.clinic_id)
        .eq('series_id', seriesId)
        .is('deleted_at', null);
      if (scope === 'future') {
        q = q.gte('starts_at', (existing as Record<string, unknown>).starts_at as string);
      }
```

Perna `pickup_route` só recebe status e horário. Não regrava serviço e **não há** recriação de Leva e Traz no patch (`shouldRewriteAppointmentServicesOnPatch` em `hubPickupPricing.ts` só exclui `pickup_route`). Qualquer outro tipo — o banho e o bloco extra `standard` — tem os serviços apagados e reinseridos com a lista do formulário (banho + adicionais), fora de transação:

```3478:3514:backend/src/modules/hub/hubAppointmentsController.ts
      if (patchServicePayload) {
        await supabaseAdmin.from('hub_appointment_services').delete().eq('appointment_id', tid);
        // ... recarrega o agendamento, monta snapshots ...
        const { error: svcErr } = await supabaseAdmin.from('hub_appointment_services').insert(svcInsert);
```

A UI, nesses escopos, **remove** `extra_blocks` do payload (`NewAppointmentModal.tsx`, por volta da linha 2140). Transporte e blocos extras não se propagam. Se o `insert` falha no meio, os dias já processados ficaram sem serviço (o `delete` já rodou) e a API devolve 500. A ordem das linhas no PostgREST não é garantida.

Horário de série usa calendário UTC (`shiftTimestampToDate` em `hubSeriesSchedulePatch.ts`, linhas 7–12). A perna “antes” calculada com `toIsoTs` (horário local do browser, `appointmentSchedulingUtils.ts` linhas 199–203) pode cair no dia civil anterior em America/Sao_Paulo. A grade esconde a perna só quando existe card principal **no mesmo dia local** (`isPickupLegHiddenFromGrid`, `agendaModel.ts` linhas 764–775). Perna em outro dia aparece sozinha: “só transporte”. No primeiro dia da série, a perna some do card do banho.

`updated_count` devolvido pela API é `targetIds.length` (inclui pernas). A agenda ignora o número e mostra “Agendamento atualizado.” (`HubAgendaPage.tsx`, linha 358). Na criação, `created_count` é o tamanho de `createdIds`, que mistura ocorrências, retorno avulso e extras independentes (`hubAppointmentsController.ts`, por volta da linha 3043, e o toast nas linhas 543–546 de `HubAgendaPage.tsx`).

**Reprodução.** Criar série semanal de Banho com Leva e Traz (ida e volta) e, se possível, um bloco extra no mesmo dia. Salvar de novo com “Este e os futuros” ou “Toda a série”, mudando horário ou serviço. Contar cards de Banho no dia editado e o que sobrou nos outros dias. Ler o toast.

**Esperado.** Cada dia mantém um banho e as duas pernas, com horário deslocado e serviço só do card principal. Bloco extra não vira cópia do banho. A mensagem diz quantas ocorrências mudaram, sem contar perna oculta.

**Atual.** Serviço do formulário é copiado para todo não-transporte da série. Leva e Traz não é regravado. Falha no meio deixa ocorrência sem linha de serviço. Toast não usa o contador.

**Impacto.** Operacional e financeiro. A agenda deixa de ser a fonte do que vai para a comanda. Três banhos no mesmo dia viram três cobranças se cada card gerar comanda. Dias que perderam o serviço cobram só o transporte, ou nada. Série recorrente é o coração do pet shop; esse fluxo não pode ir para produção como está.

**Correção.** No patch de série, restringir a regravação de serviços ao agendamento principal (`parent_appointment_id` nulo e tipo que não seja `pickup_route`). Tratar bloco extra e perna em ramos próprios. Recriar ou realinhar pernas quando o horário do banho muda, em America/Sao_Paulo, dentro de uma transação (delete+insert atômicos). Toast usa `updated_count` de ocorrências visíveis. Teste de integração: série de 3 dias com ida e volta; patch `future` altera o horário; cada dia fica com 1 banho + 2 pernas; nenhum dia fica só com transporte.

---

#### P0-03 — “Pagamentos pendentes” soma o valor cheio e ignora o que já foi recebido

| | |
| --- | --- |
| Módulo | Relatórios / recebíveis |
| Status | BUG CONFIRMADO |

**Evidência.** A tela soma `final_amount` de cada linha, inclusive no aging local e no vencido. Pagamento parcial entra na lista (`status === partially_paid`) mas o valor usado é o cheio.

```93:105:packages/hub-ui/src/pages/finance/HubRelatoriosPendingPayments.tsx
  const totals = useMemo(() => {
    let total = 0;
    // ...
    for (const r of rows) {
      const amount = Number(r.final_amount ?? 0);
      total += amount;
      if (r.overdue_days != null) {
        overdueCount += 1;
        overdueTotal += amount;
      }
```

A listagem da API devolve o recebível cru, sem `balance_amount` (`listHubFinanceReceivables`, `hubFinancialController.ts`, por volta das linhas 3105–3124). O saldo usado no Financeiro e no aging é outro: `final_amount` menos o pago líquido (`posted` menos reembolso de linha já pago), em `balanceDueFromNetPaid` / `netPaidEffective` (`hubReceivableFinancialBalance.ts`).

**Reprodução.** Cobrança de R$ 100 com R$ 40 já recebidos (`partially_paid`). Abrir Relatórios → Pagamentos pendentes e comparar com o saldo do recebível no Financeiro.

**Esperado.** Os dois lugares mostram R$ 60 em aberto.

**Atual.** O relatório mostra R$ 100. O vencido e o aging do próprio relatório também.

**Impacto.** Financeiro. Cobrança em dobro percebida pelo tutor, ou decisão de crédito/cobrança em cima de um a receber inflado. É o tipo de divergência que faz o dono voltar para a planilha.

**Correção.** A listagem (ou um campo calculado na API) deve expor o mesmo saldo de `balanceDueFromNetPaid`. A UI e o CSV usam esse campo. Teste de paridade: parcial + reembolso de linha → pendentes = aging = detalhe do recebível.

---

### P1

#### P1-01 — Fechar o turno e seguir recebendo no dia seguinte trava na execução, no handoff e na meia-noite

| | |
| --- | --- |
| Módulo | Caixa / comandas / comissão |
| Status | BUG CONFIRMADO como armadilha operacional. A frase “a API recusa o fechamento por comanda aberta” é **refutada**: o close manual usa `abortOnHandoffErrors: false`. |
| Pista de QA | Item 1 |

**Evidência.**

1. Cobrar ou enviar a comanda ao financeiro exige executor nas linhas de serviço. Leva e Traz (`pickup_route`) está isento. O resto, sem `executed_by_staff_id`, volta “Marque a execução do serviço antes de cobrar.” (`assertServiceLinesHaveExecutor`, `hubCommissionAccrual.ts`, linhas 448–461; handoff em `hubComandasController.ts`, linhas 4498–4505).
2. Marcar execução existe no drawer de Banho e Tosa (`GroomingAppointmentDrawer.tsx` / `patchHubGroomingAppointmentServiceLine`). O painel do dia no Caixa não tem essa ação. Desmarcar a execução zera `executed_at` e `executed_by_staff_id` (`hubGroomingDrawerController.ts`, linhas 472–475) e a cobrança volta a ser recusada. Não há “desfazer check-in” que limpe encaixe e comanda juntos.
3. “Marcar sem cobrança” só no modo Caixa, com comanda `aberta`, sem handoff e com `canEdit` (`FinanceDayBoardTable.tsx`, linhas 477–487; `canCaixaEditDayBoardItem` em `hubComandaEditUtils.ts`, linhas 135–140). O quadro do Financeiro não recebe `onWaive`.
4. Fechar de verdade não espera comanda quieta (`postHubFinanceCashSessionClose`, linhas 3231–3238, `abortOnHandoffErrors: false`). O servidor ainda percorre o handoff (`cashSessionCloseService.ts`, linhas 264–283). A UI, se ainda há comanda e o handoff local não rodou, chama o handoff **de novo** e só então o close (`EncerrarTurnoDrawer.tsx`, `handleClose`, linhas 136–161). No sucesso, `busy` não volta a `false` (só no `catch`). O rótulo fica “Fechando caixa…” até o drawer sumir. Não há timeout na chamada.
5. Só pode existir uma sessão `open` por unidade. Abrir outra devolve 409 (`postHubFinanceCashSessionOpen`, linhas 3170–3186). O banner do Caixa (`HubCaixaPage.tsx`, linhas 154–156 e 906–909) compara a data UTC de `opened_at` com o “hoje” local do browser. O 409 da API compara duas datas UTC do servidor. O job de auto-close usa America/Sao_Paulo (migração `150_alter_hub_cash_sessions_auto_close.sql` e `ymdSaoPaulo` em `cashSessionCloseService.ts`). Os três relógios divergem na virada das 21h.

**Reprodução.** Abrir o caixa, deixar um banho do dia sem profissional marcado na linha, tentar “Fechar mesmo assim” e observar o tempo em “Fechando caixa…”. Não encerrar e deixar o turno passar da meia-noite. No dia seguinte, tentar abrir turno novo e receber em dinheiro e em PIX.

**Esperado.** Dá para marcar execução ou dispensar cobrança no próprio Caixa. O fechamento termina ou mostra erro, sem ficar girando. Dia seguinte abre turno novo. PIX e cartão não dependem da gaveta. “Dia anterior” é o dia civil de São Paulo em todo lugar.

**Atual.** Sem execução, o handoff falha e a comanda segue aberta. O close pode completar no servidor enquanto a tela parece travada. Turno velho impede turno novo. O aviso de “dia anterior” pode aparecer ou sumir fora de hora conforme UTC e o fuso do browser.

**Impacto.** Operacional, com efeito financeiro: o balcão para de receber em dinheiro até alguém descobrir o turno velho. Comandas ficam sem cobrança (serviço feito e não faturado) ou o operador desiste e anota fora do sistema.

**Correção.** Um único calendário America/Sao_Paulo para banner, 409 e cron. Ação “marcar execução” (ou atalho para o drawer) e “sem cobrança” no painel do dia, nos dois módulos. `handleClose` com `finally { setBusy(false) }` e um handoff só. Mensagem explícita quando o handoff falhou e o caixa mesmo assim fechou. Não tratar o close como bloqueado por comanda: isso já não é o comportamento da API.

---

#### P1-02 — Checkout envia a sessão de caixa em PIX e cartão; sessão fechada recusa o recebimento

| | |
| --- | --- |
| Módulo | Caixa / pagamentos |
| Status | BUG CONFIRMADO |
| Pista de QA | Item 1 (“todos os pagamentos bloqueados”) — parcial: a trava forte não é a mensagem do banner; é este acoplamento mais a impossibilidade de abrir turno novo |

**Evidência.** O ledger diz que dinheiro exige sessão aberta e que os outros meios só validam sessão se o cliente mandar o id. O checkout manda o id em toda linha.

```570:577:packages/hub-ui/src/pages/finance/ComandaCheckoutDrawer.tsx
          await hubFinancialApi.createReceivablePayment(activeReceivableId, {
            clinic_id: clinicId,
            amount: line.amount,
            payment_method: line.method,
            installments: line.installments,
            cash_session_id: cashSessionId,
```

```199:214:backend/src/modules/hub/hubFinanceLedger.ts
  if (cashSessionId) {
    // ... lê hub_cash_sessions ...
    if (
      cashErr ||
      !cashSession ||
      cashSession.clinic_id !== clinicId ||
      cashSession.status !== 'open' ||
      (receivableUnitId && cashSession.unit_id !== receivableUnitId)
    ) {
      return { ok: false, error: 'Sessão de caixa inválida ou fechada para este recebimento.', status: 409 };
    }
```

Enquanto a sessão de ontem ainda está `open`, dinheiro e PIX com esse id passam. Depois do auto-close (ou se a UI ficou com id de sessão já fechada), PIX e cartão levam 409. O comentário do próprio ledger (“Não-dinheiro nunca exige”) não é o que o checkout pratica.

**Reprodução.** Fechar o turno (ou esperar o cron). Sem recarregar, receber uma comanda no PIX.

**Esperado.** PIX, cartão, transferência e link gravam sem sessão. Dinheiro exige sessão `open` de hoje.

**Atual.** Qualquer meio herda o `cash_session_id` da tela. Sessão fechada ou de outra unidade rejeita o pagamento.

**Impacto.** Operacional e financeiro. O balcão interpreta como “o sistema não recebe mais”. O recebível fica em aberto mesmo com o tutor pagando por fora.

**Correção.** No checkout, enviar `cash_session_id` só quando o meio é `cash`. Na API, ignorar sessão em meio não-dinheiro em vez de rejeitar (a validação atual transforma um campo opcional em trava). Teste: PIX com sessão fechada → 201 e `cash_session_id` nulo; dinheiro sem sessão → 409.

---

#### P1-03 — O “hoje” do Dashboard não é o saldo do Financeiro

| | |
| --- | --- |
| Módulo | Dashboard / recebíveis |
| Status | BUG CONFIRMADO |

**Evidência.** `getHubDayOpsSummary` (`hubDayOpsSummaryController.ts`):

- Em aberto: `final_amount − soma dos pagamentos posted` (linhas 422–437). Não desconta reembolso de linha (`lineRefundsAlreadyPaidOut`), que o Financeiro desconta.
- Vencido: soma `final_amount` integral se `due_date < dateYmd` (linhas 459–465), não o saldo.
- Recebível e pagamento do dia entram também com `unit_id` nulo (`or(unit_id.eq.X, unit_id.is.null)` nas linhas 405–410; pagamentos nas linhas 453–455). Relatório financeiro usa unidade estrita (`unitMatchesSelected`, `hubFinancialController.ts`, linhas 255–257).
- “Recebido hoje” filtra `payment_date` com `YYYY-MM-DDT00:00:00.000Z` … `T23:59:59.999Z` (linhas 61–62 e 416–417). O mesmo controller já tem `dayBoundsFromYmdSaoPaulo` e usa esse limite em outros blocos. O bloco financeiro não usa.

A home prefere esse endpoint (`HubTodayDashboardPage.tsx`, por volta das linhas 307–312). O caminho reserva no cliente (aging + dashboard) fica mais perto do Financeiro, então a tela “certa” depende de o endpoint falhar.

**Reprodução.** Unidade com um recebível parcial, um reembolso de linha e um pagamento às 22h. Comparar o card de hoje com Financeiro → aging e com o relatório de recebimentos do mesmo dia.

**Esperado.** Um saldo, uma unidade, um dia civil de São Paulo.

**Atual.** Três diferenças ao mesmo tempo: fórmula, unidade nula e fuso.

**Impacto.** Financeiro. A primeira tela que o dono abre de manhã não bate com o caixa. É o sintoma clássico de “não confio no sistema”.

**Correção.** Reusar `balanceDueFromNetPaid` e o filtro de unidade estrita. Limites do dia via `dayBoundsFromYmdSaoPaulo`. Teste de unidade comparando o JSON do day-ops com o do aging para o mesmo caso (parcial, reembolso, `unit_id` nulo, pagamento 22h BRT).

---

#### P1-04 — Faturamento, recebimento, ticket e top de serviços não são o mesmo número

| | |
| --- | --- |
| Módulo | Relatórios / Financeiro / Caixa |
| Status | BUG CONFIRMADO |

**Evidência.** Três bases convivem na visão financeira:

| Peça | O que soma | Data | Devolução / taxa |
| --- | --- | --- | --- |
| KPI “Recebimentos” (`getHubFinanceRevenueReport`) | `hub_payments.amount` com `status = posted` | `payment_date` ou `created_at`, corte **UTC** (`utcDayStartIso`, linhas 5578–5584) | Estornado fora. Reembolso de linha **não** reduz. Taxa de cartão **não** reduz |
| Ticket médio | `net_amount_at_sale` ÷ quantidade de cobranças | `created_at` da cobrança | Devolução posterior não altera o ticket (comentário na própria API, linhas 6168–6170) |
| Top serviços | `hub_receivable_lines.line_total` | `created_at` da cobrança, corte UTC (linhas 6183–6219) | Não abate devolução comercial |
| Vendas por produto / margem | receita líquida comercial − CMV do `unit_cost_amount` | cobrança vs `hub_product_return_events.created_at` | É a definição de margem; as outras telas não usam |

O CSV exporta o KPI de recebimentos com o rótulo “Faturamento recebido” (`HubRelatoriosFinanceOverview.tsx`, linha 153), enquanto o card diz “Recebimentos” (linha 201). O contrato de “Top clientes” descreve ranking por pagamentos, não por cobrança (`packages/hub-reports-contract`).

Taxa de maquininha é gravada em `card_fee_amount` / `net_amount` no pagamento (`hubFinanceLedger.ts`, por volta das linhas 1561–1565) e **não** vira despesa nem reduz o recebido. O modelo (`docs/architecture/HUB_FINANCIAL_MODEL.md`) diz que a taxa é estimativa e não altera o valor cobrado do tutor. O problema é a tela não separar “bruto do tutor” e “líquido da maquininha”, e chamar os dois de faturamento.

O saldo físico da gaveta (`compute` em `getHubFinanceCashSessionSummary`, por volta das linhas 3570–3587) é outra coisa, e isso é correto: só dinheiro operacional + suprimento − sangria. Cartão entra em `totals_by_method` e não na gaveta. Sessão fechada congela `expected_balance`.

**Reprodução.** Vender R$ 100 no crédito com taxa configurada, devolver parte no dia seguinte, e ler no mesmo período: Recebimentos, ticket, top serviços, vendas por produto e saldo de caixa.

**Esperado.** Rótulos distintos e estáveis: cobrado, recebido bruto, recebido líquido de taxa, a receber, saldo em dinheiro, comissão, margem. O dia fecha às 23h59 em São Paulo.

**Atual.** Quem soma “faturamento” em duas telas chega a números diferentes sem uma legenda que explique a diferença. Das 21h às 24h o pagamento troca de dia.

**Impacto.** Financeiro. Comissão e margem até têm fórmula própria (seção 4); o risco é o operador usar o KPI errado para fechar o mês e para pagar a equipe.

**Correção.** Congelar um glossário na API (os três domínios já existem no código: comercial na cobrança, caixa registrado, saldo a receber) e fazer cada card declarar o domínio. Parar de usar “faturamento” para pagamento `posted`. Cortar período com America/Sao_Paulo. Exibir taxa e líquido como linha informativa, sem misturar no total, até existir despesa automática. Teste de relatório com pagamento 22h BRT e com devolução parcial.

---

#### P1-05 — Encaixe e walk-in criam atendimento duplicado para o mesmo pet

| | |
| --- | --- |
| Módulo | Recepção / clínica / Banho e Tosa |
| Status | BUG CONFIRMADO |
| Pista de QA | Item 5 (duplicidade). O CPF `123` está no P3-01. |

**Evidência.** O encaixe clínico sempre insere outro `hub_appointments` (`checkInHubClinicalWalkIn`, `hubEncountersController.ts`, linhas 1129–1143). Não consulta atendimento aberto do pet. `createHubEncounter` só devolve 409 se já existe encounter **daquele** `hub_appointment_id`, não do pet. Walk-in de banho (`createHubGroomingSession`, `hubGroomingController.ts`, linhas 933–958) insere `hub_grooming_sessions` sem olhar sessão `queued` / `in_service` do mesmo pet.

**Reprodução.** No balcão, registrar dois encaixes seguidos para o mesmo pet (clínico ou banho).

**Esperado.** O segundo vira o atendimento que já está aberto, ou a API responde 409 com o id existente.

**Atual.** Dois cards, duas filas, duas comandas possíveis para o mesmo serviço.

**Impacto.** Operacional e financeiro: risco de cobrar o banho ou a consulta duas vezes, ou de dois profissionais atenderem o mesmo pet.

**Correção.** Antes do insert, buscar atendimento/sessão não terminal do pet na unidade e no dia. Unique parcial no banco para o caso de dois cliques simultâneos. Teste: segundo POST → 409.

---

#### P1-06 — O papel Financeiro na tela é o inverso da API

| | |
| --- | --- |
| Módulo | Permissões |
| Status | BUG CONFIRMADO (drift de UI). A API está alinhada ao modelo. |

**Evidência.** Backend, papel `CFINANCE` (`backend/src/utils/permissions.ts`, linhas 193–211): tem `hub.payments.reverse` e `hub.financial.adjust`; **não** tem `hub.cash.session`. Web-core (`packages/web-core/src/permissions.ts`, linhas 179–196): tem `hub.cash.session`; **não** tem `reverse` nem `adjust`. `CMANAGER` tem reverse/adjust na API (linhas 128–131) e não tem no web-core (o bloco termina em `hub.cash.receive`, linhas 116–119).

A tela esconde estorno quando `hasPermission('hub.payments.reverse')` falha (`HubComandaReceivablePanel.tsx`) e esconde gaveta quando falta `hub.cash.session` (`HubCaixaPage.tsx`, linha 891). Quem decide é o mapa do web-core. A API continua sendo a autoridade no request: o financeiro vê botão de caixa e leva 403; não vê anular/reembolsar, embora a API aceitasse.

Escalação CMANAGER → CADMIN: **refutada** no código atual. Trocar o próprio papel exige `hub.staff.roles.assign` (`hubStaffController`). Há teste em `hubStaffPrivilegeElevation.integration.test.ts`.

**Reprodução.** Entrar como CFINANCE. Abrir Caixa e o painel de estorno de um pagamento.

**Esperado.** Financeiro estorna e corrige lançamento; não abre nem fecha gaveta (isso é da recepção / admin, como o modelo descreve).

**Atual.** O contrário na interface.

**Impacto.** Operacional. Na clínica real o caixa e o financeiro são pessoas diferentes. Estorno (“Anular lançamento” e “Reembolso efetivo”) fica invisível para quem deveria fazê-lo, a menos que um administrador entre na conta.

**Correção.** Copiar o mapa do backend para o web-core (ou gerar os dois de uma fonte). Teste estático que falha se as listas divergirem. Não dar `hub.cash.session` ao CFINANCE só para “alinhar”: o backend é a regra de produto.

---

### P2

#### P2-01 — Lote vencido aparece primeiro na vacina e pode ser escolhido; a baixa com data preenchida é recusada

| | |
| --- | --- |
| Módulo | Estoque / vacina |
| Status | BUG CONFIRMADO na listagem. “Baixou estoque vencido sem alerta” é **refutado** quando `expiry_date` está preenchida. |
| Pista de QA | Item 2 (lote vencido) |

**Evidência.** `listHubInventoryLots` ordena `expiry_date` crescente (`hubInventoryController.ts`, linhas 1593–1597). O filtro que tira vencido só roda com `for_sale=1` (linhas 1591 e 1618). O formulário de vacina chama `lots.list(clinicId)` sem esse flag (`HubVaccinationForm.tsx`, linhas 58–64) e não bloqueia a seleção; só mostra a data (linhas 198–200). `validateLotStockForOut` devolve erro se `isLotExpired` (`hubInventoryStockUtils.ts`, linhas 84–86). `isLotExpired` devolve falso quando não há data (`hubInventoryExpiryUtils.ts`, linhas 10–15), e “hoje” usa o fuso do processo Node, não America/Sao_Paulo. Venda rápida e comanda pedem `for_sale` e escondem vencido.

**Reprodução.** Lote com validade ontem e saldo > 0. Abrir vacina: ele é o primeiro. Confirmar: a API deve responder 400 e o saldo não muda. Repetir com lote sem `expiry_date`: a saída passa.

**Esperado.** Vencido não entra no combo, ou entra desabilitado com alerta. Sem validade, o lote não é vendável/aplicável.

**Atual.** O combo clínico oferece o vencido. A recusa só aparece depois do clique, se houver data.

**Impacto.** Operacional (atraso e erro de quem aplica) e de estoque, se o lote sem data for usado no lugar do certo. Não é P0 porque a data preenchida segura a baixa.

**Correção.** Vacina usa a mesma listagem `for_sale`. API recusa lote sem validade em saída clínica. “Hoje” do estoque em America/Sao_Paulo.

---

#### P2-02 — Não dá para ter comissão própria de variante, de motorista ou de adicional sem tipo

| | |
| --- | --- |
| Módulo | Comissões |
| Status | Parcial. “Não existe regra para um tipo de serviço chamado Banho Premium ou Leva e Traz” é **refutado**. “Não dá para diferenciar Premium, pagar o motorista como papel e comissionar adicional solto” é BUG CONFIRMADO de modelo. |
| Pista de QA | Item 4 |

**Evidência.** A regra aponta para exatamente um `hub_service_type_id` ou um `hub_inventory_item_id` (`hubCommissionRulesController.ts`). O seletor lista todo tipo ativo (`HubCommissionsSection.tsx`, linhas 236–247), inclusive o grupo Leva e Traz, se esse tipo existir no cadastro. “Banho Premium” no produto é só o texto de exemplo do nome do tipo (`HubServiceTypesPage.tsx`), não um alvo especial. Se Premium for variante de preço do mesmo tipo (`pricing_variant`), `matchRuleForLine` (`hubCommissionCalc.ts`) casa só o tipo: a regra do Banho vale para todas as variantes. Não há alvo “motorista”. O executor de Leva e Traz só sai do `driver_staff_id` da rota quando a perna já virou parada (`hubCommissionAccrual.ts`, linhas 121–146). Sem rota, a linha pode ser cobrada (a trava de executor isenta `pickup_route`) e a comissão fica 0. Adicional de banho (`grooming_extra`) nasce com executor nulo (linhas 149–151); sem `hub_service_type_id` na linha, nenhuma regra casa.

**Reprodução.** Cadastrar Banho e uma variante/adicional “Premium” no mesmo tipo. Tentar regra só do Premium. Criar regra no tipo Leva e Traz, cobrar uma perna que ainda não está numa rota com motorista. Abrir o relatório de comissões.

**Esperado.** Dá para pagar percentual diferente no Premium, e o motorista da rota recebe a comissão da perna quando o transporte acontece.

**Atual.** Uma regra por tipo ou por produto. Motorista não é regra. Leva e Traz sem rota não gera comissão. Adicional sem tipo não gera.

**Impacto.** Financeiro (folha da equipe) com contorno: criar “Banho Premium” como tipo de serviço próprio, e só fechar comissão de transporte depois que a rota tiver motorista. Insuficiente para quem precifica Premium como porte/pelo do mesmo banho.

**Correção.** Decisão de produto, depois código: ou variante entra na chave da regra, ou o cadastro obriga tipo próprio para o que tem comissão diferente. Comissão de Leva e Traz deve poder usar o motorista previsto no agendamento, não só a rota já despachada. Adicional sempre carrega `hub_service_type_id` e um executor (tosador), senão a trava de “marque a execução” e a comissão ficam mudas.

---

#### P2-03 — Venda rápida não oferece vacina

| | |
| --- | --- |
| Módulo | Caixa / estoque |
| Status | BUG CONFIRMADO como lacuna de canal (o filtro está escrito de propósito) |
| Pista de QA | Item 6 |

**Evidência.** `QuickSaleDrawer.tsx`, `isSellableProduct` (linhas 47–52) exige `item_kind === 'product'`. A busca pede `items.list(..., 'product')`. Vacina é `item_kind: 'vaccine'`. O caminho que vende vacina é o prontuário (P0-01), não o balcão.

**Reprodução.** Abrir Venda rápida e procurar uma vacina de prateleira.

**Esperado.** Pet shop que vende dose para levar (ou aplica no balcão) escolhe a vacina, escolhe o lote e baixa o estoque.

**Atual.** A vacina não aparece. O contorno é lançar pelo prontuário, que hoje permite seguir sem lote.

**Impacto.** Operacional para pet shop. Clínica que só aplica em consulta sente menos. Vira P0 se, ao contornar pelo prontuário, a clínica usar o fluxo sem lote.

**Correção.** Incluir `vaccine` na venda rápida com lote obrigatório e a mesma validação de validade/saldo do `for_sale`. Não reabrir o atalho sem baixa.

---

#### P2-04 — “Fechando caixa…” não se desliga no sucesso, e o handoff roda duas vezes

| | |
| --- | --- |
| Módulo | Caixa |
| Status | BUG CONFIRMADO (experiência). O servidor em geral chega a fechar. |

**Evidência.** `EncerrarTurnoDrawer.tsx`, `handleClose` (linhas 126–165): `setBusy(true)` e `setBusy(false)` só no `catch`. O botão mostra “Fechando caixa…” enquanto `busy` (por volta da linha 666). O close no servidor repete `leavePendingHandoffOpenComandasForUnit` mesmo depois do handoff da tela. Comanda com erro de executor deixa o loop longo e a mensagem de erro só no fim, se a request falhar; se a request termina, a tela depende de `onClosed` desmontar o drawer.

**Reprodução.** Fechar turno com várias comandas abertas, uma delas sem executor. Clicar em “Fechar mesmo assim”.

**Esperado.** Um handoff, progresso, e ou sucesso ou erro com o botão clicável de novo.

**Atual.** Espera longa e rótulo preso. O QA lê isso como travamento. O caixa pode já estar fechado quando a pessoa desiste e tenta de novo.

**Impacto.** Operacional. Some quando o handoff é rápido. Não é loop infinito no código.

**Correção.** Ver P1-01. Incluir `finally`. Não repetir handoff se a tela já enviou.

---

#### P2-05 — Com comanda, o banco não impede dois recebíveis ativos da mesma origem

| | |
| --- | --- |
| Módulo | Comandas / recebíveis |
| Status | RISCO POTENCIAL |

**Evidência.** A migração 040 remove `uniq_hub_receivables_active_source` e recria o único só quando `comanda_id IS NULL` (`040_alter_hub_receivables_comanda_and_unique.sql`, linhas 11–15). Com comanda, a trava é `fetchActiveReceivableKeys` no código da API (`hubFinancialController.ts`, linhas 240–251, e cópias no controller de comandas): chave `source_type:source_id` para status diferente de `cancelled`. Dois checkouts simultâneos podem passar os dois no `select` antes dos dois `insert`. Status `refunded` continua ocupando a chave (não é `cancelled`), então uma nova cobrança da mesma origem depois do reembolso também esbarra na checagem — o contrário do furo de corrida, e pode impedir uma cobrança nova legítima. `cancel_rebill` (migração 174) é a intenção de reabrir itens; a chave em memória não distingue esse caso.

**Reprodução.** Dois cliques de checkout na mesma comanda, em duas abas, antes de o primeiro insert concluir. Ou reembolsar e tentar gerar a cobrança de novo da mesma sessão.

**Esperado.** No máximo um recebível ativo por origem. Reembolso ou cancelamento com `cancel_rebill` libera uma cobrança nova, de propósito.

**Atual.** Integridade depende da ordem das requisições. Reembolso pode bloquear a próxima cobrança sem uma mensagem clara de “já existe recebível refunded”.

**Impacto.** Financeiro (cobrança duplicada na corrida, ou impossibilidade de cobrar de novo depois do estorno). Idempotência de **pagamento** existe; a de **recebível** com comanda, não no banco.

**Correção.** Índice único parcial que inclua origem com `comanda_id` (ou um `source` estável por comanda+grupo), excluindo `cancelled` e, se o produto permitir, `refunded`. A checagem em memória deixa de ser a única barreira.

---

#### P2-06 — Baixa de estoque no checkout não está na mesma transação do recebível

| | |
| --- | --- |
| Módulo | Comandas / estoque |
| Status | RISCO POTENCIAL |

**Evidência.** O checkout grava recebível e linhas e depois chama `createSaleStockOut` em loop (`hubComandasController.ts`, linhas 4086–4136). Se a saída falha, há `rollbackReceivables()` em JavaScript, não um `BEGIN` no Postgres. Queda do processo entre o insert e o rollback deixa cobrança sem baixa, ou o contrário se o movimento gravou e o rollback do recebível passou. Saldo é soma de movimentos, sem `CHECK` de não negativo. Duas vendas da última unidade podem ambas passar em `validateLotStockForOut` antes de qualquer insert. Devolução tem unicidade (`hub_return_receivable_product_lines`, migrações 162 e 164) e está em melhor forma do que a venda.

Pagamento em si é atômico: produção usa `hub_post_payment`. O caminho reserva em TypeScript existe só para teste.

**Reprodução.** Estoque 1. Dois checkouts simultâneos. Ou matar o processo depois do insert do recebível e antes da baixa (só em laboratório).

**Esperado.** Ou os dois efeitos commitam, ou nenhum. A segunda venda da última unidade falha.

**Atual.** Janela de inconsistência. O caminho feliz está coberto; a falha parcial, não.

**Impacto.** Financeiro e estoque, intermitente. Menor que o P0-01, que é o caminho normal da vacina sem lote.

**Correção.** Uma RPC `hub_checkout_comanda` que cria recebível, linhas e movimentos, com `SELECT … FOR UPDATE` no lote. Enquanto isso não existe, não tratar o rollback em JS como garantia.

---

#### P2-07 — Foto de hotel em bucket público, e tarefa/incidente não são da reserva

| | |
| --- | --- |
| Módulo | Hotel / isolamento |
| Status | RISCO POTENCIAL (residual da auditoria de 16/11/2026; H1–H6 não regrediram) |

**Evidência.** `ensureMediaBucket` cria `hub-boarding-media` com `public: true` (`hubBoardingRecordsController.ts`, linhas 319–323) e grava a URL pública (linhas 360–373). `task_id` e `incident_id` do body entram no insert se forem UUID, sem checar se pertencem à reserva e à clínica (linhas 362–371). A reserva em si é carregada com `clinic_id`.

Leitura cruzada de tutor, pet, agenda, comanda, pagamento e estoque amostrada nesta passagem continua filtrando `clinic_id`. Updates de leito e crédito do tutor seguem com assert. Isso não foi retestado em staging nesta auditoria.

**Reprodução.** Com a URL do objeto (o path inclui `clinicId` e o id da reserva, mais um trecho aleatório), abrir sem sessão. Ou enviar `task_id` de outra reserva no upload.

**Esperado.** Foto só com autorização. Tarefa e incidente têm de ser da mesma reserva.

**Atual.** Quem tem a URL lê a foto. O vínculo da tarefa é confiança no cliente.

**Impacto.** Privacidade (pet, hospedagem, incidente). Não mexe no caixa. É P2 porque o path não é sequencial, mas o bucket é público de propósito no código.

**Correção.** Bucket privado e URL assinada de curta duração. Validar `task_id` / `incident_id` com `clinic_id` e `hub_boarding_reservation_id` antes do insert.

---

#### P2-08 — Dois agendamentos no mesmo horário passam se saem juntos

| | |
| --- | --- |
| Módulo | Agenda |
| Status | RISCO POTENCIAL |

**Evidência.** `assertNoScheduleConflict` (`hubAppointmentsController.ts`, por volta das linhas 251–271) lê sobreposição de profissional/recurso e recusa. Não há `FOR UPDATE` nem exclusão de intervalo no banco. Duas requisições leem “livre” e as duas inserem. Série ainda pula a ocorrência em conflito na criação, uma a uma, com a mesma janela.

**Reprodução.** Dois recepcionistas salvam o mesmo tosador no mesmo horário, no mesmo segundo.

**Esperado.** Um 201 e um 409.

**Atual.** Os dois podem gravar. A comanda depois cobra os dois slots.

**Impacto.** Operacional, com cobrança indevida se os dois atendimentos forem executados no sistema. No uso calmo, o check basta.

**Correção.** Restrição de intervalo por profissional e por recurso, ou trava da linha do profissional no horário. A checagem na API permanece como mensagem clara para quem está na agenda.

---

### P3

#### P3-01 — CPF `123` no tutor é recusado; prospect aceita qualquer 11 dígitos

| | |
| --- | --- |
| Módulo | Tutores / orçamento |
| Status | REFUTADO no tutor e no walk-in de cliente. RISCO POTENCIAL no prospect. |
| Pista de QA | Item 5 (CPF) |

**Evidência.** `taxIdCreateSchema` em `guardiansController.ts` (linhas 25–35) exige `isValidBrTaxId`. O teste `brTaxId.test.ts` espera `isValidBrTaxId('123') === false`. Recepção e venda rápida usam a mesma função. `createHubProspect` (`hubProspectsController.ts`, linhas 155–157) só exige tamanho 11 ou 14, sem dígito. Orçamento segue o mesmo padrão de “tamanho basta”.

**Reprodução.** Cadastrar tutor com CPF `123` na recepção: a API recusa. Cadastrar prospect com 11 dígitos inválidos: passa.

**Esperado.** Um validador só, em todo documento fiscal.

**Atual.** Tutor seguro. Funil de orçamento, não.

**Impacto.** Fiscal e de cadastro, baixo no caixa. Não explica o QA se o campo era o do tutor: ou o ambiente estava antigo, ou o CPF entrou por prospect/orçamento.

**Correção.** `isValidBrTaxId` também em prospect e rascunho de orçamento.

---

#### P3-02 — Toast de série não conta o que a pessoa vê

| | |
| --- | --- |
| Módulo | Agenda |
| Status | BUG CONFIRMADO (mensagem). A corrupção dos dias é o P0-02. |

**Evidência.** Criação: toast “N ocorrências foram criadas na série” usa `created_count` (`HubAgendaPage.tsx`, linhas 543–546), que não é “dias visíveis”. Edição: `updated_count` existe na resposta (`hubAppointmentsController.ts`, linha 3700) e a UI mostra só “Agendamento atualizado.” (linha 358).

**Reprodução.** Criar série de 4 banhos com ida e volta e ler o alerta. Editar “toda a série” e ler o toast.

**Esperado.** “4 ocorrências” na criação; “4 ocorrências atualizadas” na edição, sem contar perna oculta.

**Atual.** O número da criação mistura registros; o da edição não informa quantos dias mudaram. O operador acha que “não salvou a série”.

**Impacto.** Operacional, confiança. Não altera valor sozinho.

**Correção.** Contar ocorrências principais. Incluir no teste do P0-02.

---

#### P3-03 — Desconto de fatura de série reescreve o valor original enquanto o recebível está pendente

| | |
| --- | --- |
| Módulo | Comandas / série |
| Status | RISCO POTENCIAL (comportamento estreito, com trava) |

**Evidência.** `syncSeriesInvoiceTotalsAfterDiscount` (`hubComandasController.ts`, linhas 5977–6020) só mexe em recebível `pending`. Se ainda não houve pagamento, também grava `original_amount = newTotal`, apagando o valor de antes do desconto. Se o novo total ficaria abaixo do já pago, recusa. Item já faturado não se edita (`patchHubComandaItem`, linhas 6293–6299). Pagamento `posted` não é reescrito; o estorno só marca o lançamento como revertido, sem apagar a linha. Sessão fechada não reabre.

**Reprodução.** Fatura de série ainda não paga. Aplicar desconto. Comparar `original_amount` antes e depois.

**Esperado.** `original_amount` fica; o desconto aparece como ajuste (`hub_financial_adjustments`) e `final_amount` desce.

**Atual.** Pendente sem pagamento perde o original. Pendente com pagamento parcial não entra nesse update (o filtro é `status = pending`, então `partially_paid` fica com o valor velho — outra divergência pequena entre comanda e recebível).

**Impacto.** Auditoria do desconto, não o caixa do dia. O histórico de pagamento em si não é reescrito.

**Correção.** Não alterar `original_amount` depois de criado. Ajustar `final_amount` de `pending` e `partially_paid`, com o mesmo teto do já pago, e gravar o desconto como ajuste.

---

## 4. Cruzamento dos números

Domínios que o código realmente tem (e que as telas misturam):

1. **Comercial na cobrança** — o que foi vendido quando o recebível nasceu (`created_at`, `net_amount_at_sale` / linhas).
2. **Caixa registrado** — pagamento `posted` (`amount` bruto). Taxa de cartão é coluna informativa.
3. **Saldo a receber** — `final_amount` menos pago líquido (`netPaidEffective`).
4. **Gaveta** — dinheiro físico da sessão, não o faturamento do dia.
5. **Comissão** — estimativa nas linhas com regra, na competência da cobrança, não no pagamento.
6. **Margem de produto** — receita líquida comercial menos CMV do custo gravado na linha. Serviço não tem essa margem na visão financeira.

| Figura | Caixa (sessão / painel) | Financeiro | Comanda | Dashboard (day-ops) | Relatórios |
| --- | --- | --- | --- | --- | --- |
| Faturamento | Não há um KPI com esse nome. `totals_by_method` é pagamento da sessão, bruto | Não é a soma das comandas abertas | `total_amount` da comanda (itens − desconto), antes ou depois do recebível | Não calcula “vendido”; mostra operação do dia | Três coisas: recebimentos (pagamento), ticket (`net_amount_at_sale`), top serviços (`line_total`). CSV chama recebimento de faturamento |
| Recebido | Soma `amount` `posted` ligada à sessão, por meio. Dinheiro entra na gaveta; cartão não | `payments_total_period`, mesma soma bruta, unidade estrita | Soma dos pagamentos do recebível da comanda (pago líquido no detalhe) | `received_today`: `posted.amount` no dia **UTC**, unidade **ou** `unit_id` nulo | Igual ao Financeiro, corte UTC, `payment_date` ou `created_at` |
| Saldo de caixa | `abertura + dinheiro posted + crédito em dinheiro + suprimento − sangria`. Fechado = valor congelado | Não substitui a gaveta | Não | Só indica se há sessão aberta | Fluxo de caixa usa pagamento bruto; não é a gaveta |
| Recebíveis | Painel do dia usa saldo (`balanceDueFromNetPaid`) | Aging e “em aberto” usam saldo líquido | Saldo do recebível ativo | `final_amount − posted`, **sem** reembolso de linha; vencido = valor cheio; inclui `unit_id` nulo | **Pagamentos pendentes = `final_amount` cheio** (P0-03). Aging da visão financeira usa saldo |
| Comissão | Não entra no fechar gaveta | Prévia por regra na cobrança | Snapshot na linha na hora de cobrar, se houver executor/regra | Fora | Relatório na competência da cobrança; devolução de produto reverte parte. Não espera o pagamento |
| Margem | Fora | Fora do KPI de recebimentos | Custo de produto copiado para a linha na venda | Fora | Vendas por produto: receita líquida − `unit_cost_amount`. Sem custo gravado, a margem fica incompleta de propósito (sem cair no preço atual do cadastro). Top serviços não tem margem |
| Estorno / reembolso | Anulação tira o pagamento do somatório (`reversed`). Reembolso em dinheiro de devolução parcial vira sangria; devolução total não sangra de novo (evita dobrar) | Reembolso (`adjustment_type = refund`) não reduz o KPI de recebimentos se o pagamento segue `posted` (devolução de linha) | Status do recebível recalculado na RPC | Ignora reembolso de linha no “a receber” | Anulação sai do `posted`. Reembolso de linha, não |
| Taxa de cartão | Informativa na sessão | Não reduz recebido nem vira despesa | Não muda o valor cobrado do tutor | Não entra | Não entra no total |

Onde divergem de um jeito que muda decisão:

- **A receber:** painel do Caixa e aging ≠ Dashboard ≠ Pagamentos pendentes (P0-03, P1-03).
- **“Quanto entrou hoje”:** gaveta (só dinheiro da sessão) ≠ recebimentos (todos os meios, dia UTC) ≠ Dashboard (dia UTC + unidade nula) (P1-04).
- **Faturamento do mês:** ticket e top serviços (cobrança) ≠ recebimentos (caixa) ≠ margem de produto (líquido de devolução).
- **Comissão ≠ margem ≠ recebido.** Comissão não espera a baixa do pagamento. Margem não existe para serviço nessa visão. Taxa de cartão não sai de nenhum dos três.
- **Dia:** relatórios e o bloco financeiro do Dashboard cortam em UTC; auto-close do caixa corta em São Paulo (P1-01, P1-04).

---

## 5. Lacunas de teste

O que a suíte já segura (pelo nome e pelo que o teste afirma, sem rodar aqui):

| Tema | Onde |
| --- | --- |
| Auto-close, cron, duas fechadas concorrentes | `cashSessionAutoClose.integration.test.ts` |
| Notas de handoff no close | `cashSessionCloseNotes.test.ts` |
| Gate de executor | `hubCommissionExecutorGate.test.ts` |
| Pagamento: RPC obrigatória, idempotência, teto, concorrência | `hubFinancePaymentRpcRequired.test.ts`, `hubFinancePaymentIdempotency.integration.test.ts`, `hubFinancePaymentOverpay.integration.test.ts`, `hubFinanceLedgerConcurrency.integration.test.ts` |
| Estorno e devolução com estoque | `hubFinancePaymentReverse*`, `hubFinanceRefundRestock.integration.test.ts` |
| Margem comercial líquida | `hubReportCommercialNet.test.ts` |
| Vacina sem lote é aceita e não baixa | `hubVaccinationStock.integration.test.ts` — o teste **congela o furo** do P0-01 |
| CPF `123` inválido | `brTaxId.test.ts` |
| Isolamento clínico e anti-escalação de papel | `hubTenantIsolationClinical.integration.test.ts`, `hubStaffPrivilegeElevation.integration.test.ts` |
| Horário de série (não o serviço + Leva e Traz) | `hubSeriesSchedulePatch.test.ts` |

O que não aparece como teste e é exatamente o risco desta auditoria:

| Lacuna | Achado |
| --- | --- |
| Vacina sem lote não pode ir para comanda paga com saldo intacto | P0-01 |
| PATCH de série `future`/`all` com banho + ida/volta + bloco extra | P0-02 |
| Pagamentos pendentes = aging no parcial e no reembolso de linha | P0-03 |
| Day-ops = Financeiro (fuso 22h, unidade nula, reembolso de linha) | P1-03, P1-04 |
| PIX com `cash_session_id` de sessão fechada | P1-02 |
| Banner “dia anterior” = cron em America/Sao_Paulo | P1-01 |
| Segundo encaixe do mesmo pet | P1-05 |
| Mapa web-core = mapa da API | P1-06 |
| Dois checkouts da última unidade | P2-06 |
| Upload de foto com `task_id` de outra reserva | P2-07 |
| Prospect com CPF de 11 dígitos inválidos | P3-01 |

Não alterar teste para mascarar falha. O teste que aceita vacina sem baixa deve ser invertido quando o P0-01 for corrigido, não antes.

---

## 6. O que não virou achado

- **H1–H6** (pet/prescrição/exame/internação/leito/crédito/hotel create) estão com assert de clínica no código lido. Não revalidei em staging.
- **Estorno** distingue anulação e reembolso e não dá `DELETE` no pagamento. Devolução total em dinheiro não desconta a gaveta duas vezes.
- **Item já faturado** não é editado. Sessão fechada não tem o `expected_balance` recalculado por baixo.
- **Pagamento duplicado por duplo clique** tem chave de idempotência e a RPC.
- **CPF do tutor** rejeita `123`.
- **Regra de comissão para um tipo cadastrado** “Banho Premium” ou “Leva e Traz” é possível. O buraco é variante, motorista e adicional sem tipo (P2-02).
- **Venda rápida sem vacina** é filtro explícito, não um combo quebrado (P2-03).
- **Fechar o caixa com comanda aberta** a API permite. O sintoma de “não fecha” é a espera da UI e o handoff, não um 409 (P1-01, P2-04).

---

## 7. Diagnóstico

**NO-GO** para substituir o sistema atual como única operação e única verdade de número.

Motivo, em uma frase: o dia da recepção (turno, série com transporte, encaixe, vacina) e os cartões de dinheiro (dashboard, pendentes, “faturamento”) não estão no mesmo estado de prontidão que o lançamento de um pagamento isolado.

**Condições mínimas para um piloto assistido** (sistema antigo continua de retaguarda; não é a troca):

1. Fechar P0-01, P0-02 e P0-03. Sem isso o piloto já nasce com estoque mentindo, agenda recorrente instável e cobrança de inadimplente errada.
2. Fechar P1-01 e P1-02 antes de qualquer unidade que fecha caixa todo dia. Sem isso a segunda manhã para.
3. Combinar com a clínica, por escrito, qual número ela olha até o P1-03 e o P1-04 existirem: saldo do recebível no Financeiro, não o Dashboard e não “Pagamentos pendentes”. Gaveta só para dinheiro vivo.
4. Financeiro da clínica entra como CADMIN, ou o P1-06 entra no piloto. Se não, estorno fica escondido.
5. Não vender vacina pelo prontuário “sem lote” durante o piloto (procedimento, até o P0-01). Venda rápida de produto com lote pode.
6. Série com Leva e Traz fica fora do piloto até o P0-02. Série só de banho, editada em “somente este”, é menos arriscada e ainda assim deve ser conferida.
7. Conferência diária humana: gaveta contada versus saldo esperado, e uma amostra de comanda versus recebível. O sistema ainda não faz essa conferência sozinho entre as telas.

Fora dessas condições, clínica ou pet shop que depender de recorrência com busca e entrega, de vacina de estoque e de fechar o caixa à noite não deve migrar.

---

## 8. Backlog de correção (sem implementar)

Ordem sugerida. Esforço é tamanho técnico, não prazo: **P** = um módulo, pouco risco; **M** = tela + API, ou uma migração; **G** = muda contrato de número ou precisa de transação e regressão financeira.

| Ordem | ID | Por quê agora | Esforço |
| --- | --- | --- | --- |
| 1 | P0-01 | Estoque e cobrança da vacina se separam no fluxo normal, não na exceção | M |
| 2 | P0-03 | O relatório que a clínica usa para cobrar está errado em todo parcial | P |
| 3 | P1-02 | Destrava PIX/cartão depois que o turno fecha; mudança pequena e de alto efeito | P |
| 4 | P1-01 | Um fuso só, execução no Caixa, botão que termina, handoff uma vez | M |
| 5 | P0-02 | Série com transporte não pode ir para pet shop sem isso | G |
| 6 | P1-03 | Dashboard deixa de contradizer o Financeiro | M |
| 7 | P1-04 | Glossário único e dia em São Paulo nos relatórios | G |
| 8 | P1-05 | Segundo encaixe do mesmo pet | P |
| 9 | P1-06 | Alinhar web-core ao backend | P |
| 10 | P2-05 | Índice único do recebível com comanda | M |
| 11 | P2-06 | Checkout + estoque na mesma RPC, com lock de lote | G |
| 12 | P2-01 | Combo de vacina igual ao da venda; lote sem validade não sai | P |
| 13 | P2-02 | Decisão de produto (variante / motorista) e só então a regra | M |
| 14 | P2-03 | Vacina na venda rápida, com lote obrigatório, depois do P0-01 | M |
| 15 | P2-04 | Incluso no P1-01 se aquele for feito por completo | P |
| 16 | P2-07 | Bucket privado e FK de tarefa/incidente | M |
| 17 | P2-08 | Exclusão de horário no banco | M |
| 18 | P3-01 | Dígito verificador no prospect | P |
| 19 | P3-02 | Incluso no teste do P0-02 | P |
| 20 | P3-03 | Parar de reescrever `original_amount` | P |

Não misturar este pacote com deploy de staging nem com a suíte E2E inteira no mesmo ciclo. A ordem de verificação, quando houver correção, é: teste de módulo do item → um cenário Playwright filtrado do fluxo (caixa, ou agenda, ou vacina) → só então a regressão ampla.

---

## 9. Handoff

- Objetivo desta fatia: auditoria de prontidão, só documento.
- Decisões travadas: veredito NO-GO; P0-01, P0-02 e P0-03 antes de qualquer piloto que desligue o sistema antigo; CPF de tutor não é o bug relatado.
- Branch: `cursor/auditoria-prontidao-producao-d660`. Sem SHA de produto novo.
- Testes executados: nenhum (leitura apenas).
- Pendência: reproduzir P0-02 e P1-01 numa base de staging **depois** que houver correção, não como parte deste PR.
- Não fazer a partir daqui: `railway up`, suíte E2E completa, mudança de código “já que o relatório apontou”. Cada correção é um PR de produto com o teste da seção 5.
