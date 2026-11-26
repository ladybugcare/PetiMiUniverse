# QA — multi-pet, recorrência e leva e traz (como o código faz hoje)

Análise somente leitura do Hub em `staging` (`224bbbca`, que contém `f2c0d542`). Nenhum código de produto foi alterado. Os números abaixo são um **catálogo de referência**: na unidade de staging, troque pelos valores cadastrados e confira a aritmética.

## Catálogo de referência (fixture)

| Item | Cadastro | Venda |
| --- | --- | --- |
| Banho (grupo `banho_tosa`, matriz `porte`) | porte `pequeno` | R$ 50,00 |
| Banho | porte `grande` | R$ 80,00 |
| Consulta (grupo clínica, preço único) | `sale_amount` | R$ 120,00 |
| Leva e Traz (grupo `leva_traz`, matriz `km_banda`) | faixa índice 0, rótulo «até 5 km», `pickup_price_scope = round_trip` | R$ 40,00 |
| Mesmo L&T | `pickup_price_scope = per_leg` | R$ 40,00 **por perna** |

Tutor **Ana**. Pets: **Pipoca** (`size_tier = pequeno`) e **Thor** (`size_tier = grande`). Pelagem e peso não entram neste fixture.

## O que caçar primeiro

1. **Multi-pet + leva e traz cobra o transporte uma vez na tela e uma vez por pet no banco.** O total do modal soma o L&T uma única vez (`NewAppointmentModal.tsx` ~3155–3158). O lote chama `createHubAppointment` por pet com o mesmo `shared`, inclusive `with_pickup_route_*` e `pickup_route_pricing` (`createHubAppointmentBatch`, `hubAppointmentsController.ts` 3622–3658). Com o fixture, a tela mostra **R$ 170,00** (50+80+40) e o banco grava **R$ 210,00** (50+20+20 + 80+20+20).
2. **A comanda do banho/consulta não inclui as pernas de transporte.** Cada perna é outro `hub_appointments` (`appointment_kind = pickup_route`, `parent_appointment_id` do serviço). `sumAppointmentServicesSaleForComanda` lê só `appointment_id` da origem (`hubComandasController.ts` 1170–1211). Abrir a comanda do banho lista só o banho.
3. **Cancelar o serviço não cancela as pernas.** O painel da agenda faz `PATCH` só no card selecionado, sem `scope` (`HubAgendaPage.tsx` `handleAppointmentStatusChange` 1581–1593; default `scope=this`, `hubAppointmentsController.ts` 2990). As pernas continuam no caixa.
4. **Editar a série com «Este e os futuros» ou «Toda a série» regrava os serviços de todos os rows com o mesmo `series_id`, inclusive as pernas de L&T.** O patch apaga `hub_appointment_services` de cada id e reinsere as linhas do serviço principal (`hubAppointmentsController.ts` 3194–3208 e 3310–3311).
5. **Fatura em série não impede cobrar a ocorrência antes da emissão.** O caixa só zera o valor depois que existe item de `hub_series_invoice_items` com comanda (`hubFinancialController.ts` 5387–5402). Cobrar o dia e depois emitir a fatura do mês duplica a cobrança. A fatura também soma as pernas de L&T da mesma `series_id` (`issueSeriesInvoiceForPeriod`, `hubSeriesBillingService.ts` 232–244).
6. **Bloco extra com L&T ignora a faixa de km.** O preço do bloco usa `sale_amount` do tipo, não a matriz (`hubAppointmentsController.ts` 2738–2744). O L&T da visita usa a faixa (`2008–2041`).
7. **Comissão do banho não usa o profissional do agendamento.** Só `executed_by_staff_id` da linha. Sem isso, a linha fica sem profissional (`hubCommissionAccrual.ts` `resolveServiceExecutorStaff` 110–120). L&T só atribui o motorista se a perna já estiver numa rota com `driver_staff_id` (121–146).

---

## 1. Multi-pet

### O que existe

Um agendamento por pet, ligados por `visit_group_id`. Não existe comanda única do tutor nem do grupo.

| Regra | Onde |
| --- | --- |
| Seletor de vários pets só na criação, fora de rotina clínica e de encaixe | `multiPetEnabled = !isEditMode && !isClinicalRoutine && !isWalkIn` — `NewAppointmentModal.tsx` 434 |
| Dois ou mais pets disparam o lote | `isMultiPetSelection` 566; `POST /api/hub/appointments/batch` 2753–2795 |
| Mínimo 2, máximo 20 pets; cada um vira `createHubAppointment` | `createHubAppointmentBatch` 3584–3658; schema `pets.min(2).max(20)` ~1210 |
| Mesmo `visit_group_id` (UUID novo se o cliente não mandar) | 3607, 3641 |
| Pets **não** se ligam por `parent_appointment_id`. Esse campo é de bloco extra e de perna de L&T | insert da perna 2436–2437 |
| Horários em série se «mesmo profissional»; em paralelo se profissionais diferentes | `computePetVisitTimings` em `appointmentSchedulingUtils.ts` |
| Serviços, porte, pelagem, staff e blocos extras são por pet (`petVisitConfigs`) | efeito ~1500; payload 2754–2779 |
| Conflito de horário é ignorado dentro do lote (`allow_schedule_overlap: true`) | 3640 |
| Falha no meio faz soft-delete só dos **pais** já criados (`createdIds`). Pernas de L&T criadas no meio **não** entram nesse rollback | 3611–3618 vs insert da perna 2423–2445 (id da perna não é empurrado em `createdIds`) |

**Clínica.** O consultório abre o modal com `layoutVariant: 'clinical_routine'` e o encaixe com `walk_in`. Os dois desligam multi-pet. A agenda normal (`/hub/appointments`, modal padrão) aceita multi-pet também para serviço clínico: continua 1 agendamento por pet.

**Edição.** Não dá para acrescentar pet numa visita já gravada. O modal de edição é mono-pet.

### Comanda

Não nasce na reserva.

| Momento | Efeito |
| --- | --- |
| Gravação | Só `hub_appointments` + `hub_appointment_services`. Sem comanda. |
| «Abrir comanda» na agenda | `handleOpenComanda` (`HubAgendaPage.tsx` 1688–1703) → `origin_type: 'appointment'`, `origin_id` = aquele agendamento |
| Conclusão (`done` / `paid`) | `syncOpenComandasAfterAppointmentOperationalComplete` no patch (3416–3419) — sincroniza a comanda **daquele** id |
| Sessão de banho | 1 `hub_grooming_sessions` por agendamento. A comanda da sessão lê os serviços desse `hub_appointment_id` (1386–1388), mais extras da sessão |

Índice único: uma comanda ativa por `(clinic_id, origin_type, origin_id)` (`039_create_hub_comandas.sql`). Cabeçalho `pet_id` = pet daquele agendamento (`buildComandaItemsFromAppointment` 1288–1349). Cada linha de serviço repete esse `pet_id`. A coluna Pet da comanda (`ComandaItemsSection.tsx`) existe, mas a origem `appointment` é mono-pet.

Cancelado não abre comanda: status `cancelled` → `NOT_READY` (1279–1280).

### Preço por pet

Dimensões que entram: **porte** (`size_tier` do pet ou override do agendamento), **pelagem** (`coat_type`), **porte+pelagem**, e o atalho **filhote** se a idade em meses completos for menor que `pet_puppy_max_months` da clínica e a matriz tiver o tier `filhote`.

Não entram: **peso**, **espécie**, distância, bairro.

Resolução: `resolveServiceLinePricing` / `resolveAutoPorte` (`hubPricingResolve.ts` 191–208 e 283–355). Ordem do porte: override válido → filhote por idade → `size_tier` do pet (ausente vira `medio`) → primeiro tier da matriz.

O front só pré-visualiza (`multiPetPricingSummaries`, `agendaPortePricingPreview.ts`). O back **recalcula e grava** `sale_amount_applied` / `cost_amount_applied` em `buildServiceLineSnapshots` (644–737). A comanda usa o snapshot, não o catálogo ao vivo (`resolveAppliedSaleAmount` em 1191).

Preço especial ativo (pet, tutor ou plano família já gravado) substitui a venda do catálogo (709–714). Override manual da linha ganha dos dois (716–719). Na agenda, persistir acordo só aceita escopo `pet` ou `guardian` (1086) — o plano família não nasce desse modal.

### Comissão

Apuração na **criação do recebível** (`accrueCommissionSnapshots`, chamado em `hubFinancialController.ts` ~1033 e ~1201), não na reserva.

- Uma linha de comanda/recebível → uma base.
- Regra por `hub_service_type_id`: `% da base líquida`, valor fixo por linha ou fixo × quantidade (`computeCommissionAmount`, `hubCommissionCalc.ts` 27–41).
- Dois pets = dois agendamentos = duas linhas. Não há rateio entre pets. Staff compartilhado não divide a comissão: cada linha vai inteira para o `executed_by_staff_id` dela.
- Sem executor gravado na linha de serviço, a comissão de banho/consulta fica sem profissional, mesmo com `hub_staff_member_id` no agendamento.

### Cancelar / falta de um pet

Não existe status `no_show` em agendamento (`appointmentStatusSchema` 112–120). O day board filtra `cancelled` e `no_show` (4593), mas a API não grava falta. Falta de hotel/creche é outro fluxo.

Cancelar no painel altera **só o card aberto**. Os irmãos do `visit_group_id` seguem. `visit_group` entra em conflito de agenda (`loadRelatedScheduleExcludeIds`), não em cancelamento em massa.

Se a comanda daquele agendamento já teve pagamento (`paid_total > 0`), `maybeFlagComandaCancellationPending` (5145–5177) marca pendência financeira. Sem pagamento, o cancelamento não mexe na comanda. A comanda do irmão não é afetada.

### Caminho na UI

1. Hub → Agenda (`/hub/appointments`, `HubAgendaPage` + `NewAppointmentModal`).
2. Novo agendamento (não usar o atalho de rotina clínica nem encaixe).
3. Tutor → mais de um pet → serviços por pet → salvar.
4. Na grade, os cards da mesma visita mostram o selo de visita multi-pet (`AgendaAppointmentCard`).
5. Comanda: ação do card, ou Caixa (`/hub/caixa`) no dia. Banho operacional: `/hub/banho-tosa`.

### Casos

**MP-1 — dois portes, sem transporte.** Agenda padrão, Ana, Pipoca + Thor, Banho nos dois, mesmo profissional, sem recorrência, sem L&T.

- Prévia: Pipoca R$ 50,00; Thor R$ 80,00; total **R$ 130,00**.
- Banco: 2 `hub_appointments`, mesmo `visit_group_id`, `parent_appointment_id` nulo. `sale_amount_applied` 50 e 80. `pricing_porte_tier_applied` `pequeno` e `grande`.
- Nenhuma comanda até abrir ou concluir.
- Ao abrir cada comanda (ou concluir cada banho e sincronizar): **duas comandas**. Pipoca: 1 linha Banho R$ 50,00. Thor: 1 linha Banho R$ 80,00. Não existe linha única de R$ 130,00.

**MP-2 — consulta na agenda padrão.** Mesmos pets, serviço Consulta R$ 120,00.

- Prévia e snapshots: 120 + 120 = **R$ 240,00**, duas comandas quando abertas.
- Pelo consultório (`clinical_routine`) o seletor multi-pet **não aparece**. Um pet por vez.

**MP-3 — cancelar só a Pipoca.** Depois do MP-1, abrir o card da Pipoca → Cancelar.

- Só o agendamento da Pipoca fica `cancelled`. Thor permanece.
- Caixa do dia: só Thor R$ 80,00 (e a perna de L&T dele, se houver).
- Comanda da Pipoca ainda não aberta: não abre (`NOT_READY`).
- Comanda da Pipoca já paga: pendência de cancelamento nessa comanda; a do Thor intacta.

**MP-4 — falta.** Não há ação «falta» no card. O status não muda para `no_show`.

**MP-5 — preço especial da Pipoca.** Acordo ativo de Banho R$ 30,00 no pet Pipoca.

- Snapshot da Pipoca: `sale_amount_applied = 30`, `pricing_source` de especial. Thor continua 80 (matriz). Total 110.

---

## 2. Recorrência

### O que existe

A série nasce inteira na hora (até 52 datas). Não há job que crie ocorrências futuras depois.

| Regra | Onde |
| --- | --- |
| Frequências: diária, semanal, quinzenal, mensal | UI `NewAppointmentModal.tsx` 4357–4384; API `recurrenceSchema` ~1120 |
| Quinzenal vira semanal com intervalo 2 | `normalizeRecurrenceRule`, `hubRecurrenceService.ts` 35–41 |
| Dias da semana ISO 1=segunda … 7=domingo. Sem dia marcado, usa o dia da data inicial | `seriesDaysOfWeek` / `generateOccurrenceDates` |
| Término: N ocorrências **ou** data. Teto **52** mesmo com «até a data» | `MAX_OCCURRENCES`, `hubRecurrenceService.ts` 9 e 61–62; input UI `max={52}` 4458–4462 |
| Mensal: dia do mês; mês curto cai no último dia | `hubRecurrenceService.ts` ~100–112 |
| Datas em UTC (`T00:00:00Z`); a hora de cada slot copia a hora do primeiro | `shiftTimestampToDate` 841–846 |
| Front e back usam o mesmo algoritmo de datas | `packages/hub-ui/src/pages/agenda/recurrenceDates.ts` e `hubRecurrenceService.ts` |
| Mensal: a UI manda `new Date(startsAt).getDate()` (fuso local, 2732); o back usa o dia UTC de `starts_at` se `day_of_month` não vier | divergência só perto da meia-noite UTC |
| Série não aceita sobreposição cega: grava os slots livres e devolve os conflitantes | `isSeriesCreate` 1737–1741; loop ~2263 |
| Hotel não repete | validação no modal e `validateHotelNoRecurrence` |
| Regra em `hub_appointment_series` (INSERT). O patch **não** altera frequência, término nem `billing_mode` | insert ~2218 |
| Preço é snapshot **por ocorrência** (`appointmentYmd` de cada data), não só da primeira | `buildServiceLineSnapshots` 2365–2373 |
| Multi-pet + repetir: o `shared` do lote inclui `recurrence`, então **cada pet ganha a própria série**. O `visit_group_id` de cada data é um UUID derivado (`visitGroupIdForOccurrence` 849–856) | batch 3622 + insert 2326–2329 |

Não existe: desconto de série, cobrança antecipada de N sessões, «pré-pago» como modo da recorrência, destaque de uma ocorrência (`series_id` não é limpo). `recurrence_detached` é de **conta a pagar**, não de agenda.

### Cobrança

Dois modos, escolhidos no modal («Como quer cobrar esta série?», 4476–4500):

**Separado (`per_occurrence`, padrão).** Cada ocorrência entra no caixa no dia dela, com o `sale_amount_applied` dela. Comanda só quando alguém abre (`origin_type = appointment`) ou quando o operacional conclui e sincroniza. Recebível nasce no checkout dessa comanda.

**Fatura em série (`periodic_invoice`).** Ciclo = mês calendário. Emissão no 1º dia útil ou num dia fixo (1–28). Vencimento no mesmo dia, em N dias, ou dia fixo. Job `runSeriesInvoiceIssuanceJob` quando `issue_date` é hoje; também dá para emitir manual (`hubSeriesBillingController`). `issueSeriesInvoiceForPeriod` (166–357):

- Junta todos os agendamentos da `series_id` no mês, exceto `cancelled` / `no_show` / apagados — **incluindo pernas `pickup_route`**.
- Comanda `origin_type = series_invoice`, `discount_amount = 0`, `pet_id` = pet da primeira ocorrência.
- Uma linha por serviço de cada ocorrência, com o nome e a data.
- Recebível `pending` ligado a essa comanda.
- Cabeçalho do caixa da ocorrência passa a R$ 0,00 e aponta a comanda da fatura **depois** que o item da fatura existe (5387–5402).

Pacote (banho pré-pago) **não** é modo de recorrência:

- Venda em `/hub/servicos/pacotes` (`SellPackageDrawer`). Pode sugerir abrir a agenda com recorrência (`packageSaleScheduleUtils.ts`).
- Saldo cobre a estimativa do dia e, na abertura da comanda, zera a linha do serviço com saldo (`autoApplyEligiblePackagesToItems`, `hasPackageBalanceForServices` 930–947). O saldo é do pet quando `pet_id` do saldo está preenchido; saldo sem pet vale para o tutor.
- Criar série em **fatura mensal** com saldo ativo daquele serviço no pet responde **409** (2202–2214). Separado + pacote é permitido: a comanda baixa o saldo.
- Linha já coberta por fatura de série não recebe baixa de pacote (1326–1340).

`/hub/assinatura` é a assinatura **SaaS da clínica** (Mercado Pago). Não cobra pet, pacote nem recorrência de agenda.

Plano família (`family_plan` em preços especiais) é um preço negociado para uma lista de pets. Não gera série nem comanda sozinho.

### Editar ou cancelar

| Ação | Efeito |
| --- | --- |
| Salvar edição de um card que tem `series_id` | Modal «Aplicar alterações em»: Só este / Este e os futuros / Toda a série (`NewAppointmentModal.tsx` 3299–3318). API `?scope=this\|future\|all` |
| Cancelar pelo painel lateral | Sem esse modal. `PATCH` sem scope = **só aquele card** |
| `future` / `all` | Todo row com aquele `series_id` e (no futuro) `starts_at` ≥ o atual, **perna de L&T inclusa** |
| Blocos extras no patch | Só com scope `this` (3001–3004) |
| Mudar preço/serviço na série | Re-snapshot das linhas enviadas, por data de cada id. Não recalcula a partir de uma regra nova da série (a regra não é editável) |

### Caminho na UI

Agenda `/hub/appointments` → Novo agendamento → «Repetir este bloco» (ou «Repetir a visita» se o L&T da visita estiver ligado). Caixa `/hub/caixa`. Pacotes `/hub/servicos/pacotes`.

### Casos

**RC-1 — semanal, 4 vezes, separado.** Pipoca, Banho, toda semana, 4 ocorrências, cobrança Separado, sem L&T.

- Nascem **4** agendamentos já, mesma `series_id`, `sale_amount_applied = 50` em cada um.
- Nenhuma comanda na hora.
- Caixa de cada dia: 1 linha R$ 50,00, até abrir/concluir.
- Total se os quatro forem cobrados: **R$ 200,00**, em quatro comandas / quatro recebíveis.

**RC-2 — uma ocorrência.** No RC-1, editar a 2ª data, trocar para um serviço de R$ 70,00, «Só este agendamento».

- Só a 2ª fica 70. As outras continuam 50. Todas mantêm `series_id`.

**RC-3 — cancelar uma data pelo painel.** Cancelar a 3ª.

- Só a 3ª fica `cancelled`. Some do caixa. As outras datas seguem. Não há «cancelar a série» nesse botão.

**RC-4 — fatura em série, mês com 4 banhos de R$ 50.**

- Antes da emissão: cada dia ainda aparece com R$ 50,00 e **pode ser cobrado**.
- Depois de `issueSeriesInvoiceForPeriod`: 1 comanda `series_invoice` com 4 linhas de R$ 50,00, desconto 0, total **R$ 200,00**, 1 recebível. O day board de cada ocorrência mostra R$ 0,00 e a comanda da fatura.
- Se alguém já tiver recebido um dos dias, a fatura **não** desconta esse valor (não há guarda; `seriesHasIssuedInvoice` não é chamada em lugar nenhum).

**RC-5 — pacote de 4 banhos da Pipoca + série Separado.**

- Estimativa do dia zerada enquanto houver saldo daquele serviço naquele pet.
- Abrir a comanda grava a linha com saldo e não cobra de novo.
- Tentar a mesma série em «Fatura em série» → erro 409.

**RC-6 — multi-pet + 4 semanas.** Pipoca e Thor, Banho, Separado, sem L&T.

- 2 séries, 8 agendamentos. Cada data compartilha um `visit_group_id` derivado, igual entre os dois pets daquele dia e diferente do dia seguinte.
- Caixa de um dia: Pipoca R$ 50,00 e Thor R$ 80,00, comandas separadas. Quatro semanas: **R$ 520,00** se tudo for cobrado (4×50 + 4×80).

---

## 3. Leva e traz

### O que existe

Preço de catálogo, congelado na perna. A tela `/hub/leva-e-traz` organiza rota e motorista e **não recalcula taxa**.

| Regra | Onde |
| --- | --- |
| Grupo do tipo tem de ser `leva_traz` | `validateLevaTrazServiceType` |
| Matriz aceita no agendamento: nenhuma (preço único = `sale_amount`), `km_banda` ou `personalizado` | create 1893–1920 |
| A faixa é o **índice** que a pessoa escolhe. `km_min` / `km_max` são rótulo. Geocode não entra no preço | `pickKmBandaTier`, `hubPricingResolve.ts` 166–188 |
| Não há «grátis acima de X», nem tarifa automática por bairro. «Personalizado» pode ser usado como região, mas a escolha é manual | |
| Escopo do cadastro: `round_trip` (padrão) ou `per_leg` | `hubServiceTypesController.ts` ~486; coluna na migração 087 |
| Modo na agenda: ida e volta, só busca, só retorno | `pickupMode`; pernas em `pickupModeLegCount` (`hubPickupPricing.ts` 67–70) |
| Repartição | `resolvePickupLegAmounts` (back 29–68, espelho na UI `packages/hub-ui/src/utils/hubPickupPricing.ts`) |

Aritmética do fixture R$ 40,00:

| Escopo | Modo | Perna 1 | Perna 2 | Total cobrado |
| --- | --- | --- | --- | --- |
| `round_trip` | ida e volta | 20,00 | 20,00 | **40,00** |
| `round_trip` | só busca ou só retorno | 20,00 | — | **20,00** (metade; não é a tarifa cheia) |
| `per_leg` | ida e volta | 40,00 | 40,00 | **80,00** |
| `per_leg` | uma perna | 40,00 | — | **40,00** |

Centavos: a primeira perna é `round(total/2)`; a segunda é o resto (`splitMoneyTotalAcrossTwoLegs` 6–8). R$ 40,01 vira 20,01 + 20,00.

**Anexo a banho/consulta.** Checkbox de L&T na visita. Nasce um `hub_appointments` filho por perna, `appointment_kind = pickup_route`, `parent_appointment_id` = serviço, `pet_id` = pet daquele agendamento, `series_id` copiada. O serviço da perna grava `sale_amount_override` já rateado (2415–2481). O pai **não** ganha linha de transporte.

**L&T como serviço principal.** O pai já é `pickup_route`. Ida e volta cria um filho de retorno com a segunda perna (2485–2559). São dois agendamentos cobráveis.

**Visita com vários blocos.** O L&T da visita vai no payload principal, uma vez. Não multiplica por bloco. Não pode ligar L&T na visita e de novo num bloco (`validatePickupMutex`). Com L&T na visita, os blocos extras precisam do mesmo ritmo de recorrência.

**Por pet.** A taxa não olha porte, peso nem quantidade de pets. O que multiplica é o lote (gap 1).

### Comanda e caixa

Cada perna é uma origem `appointment` no day board, com o próprio `estimated_amount` (4580–4710). A comanda do pai não puxa filhos. Para fechar o combinado é preciso abrir (ou concluir) **pai e pernas**, ou cobrar as linhas soltas do caixa.

O lote do caixa agrupa visualmente pela visita (`resolveVisitKey`, `batchChargeItems.ts` 48–79): a perna herda o `visit_group_id` do pai se o pai estiver no mesmo conjunto. Continua sendo vários recebíveis.

### Comissão

Sem regra especial de grupo. Se existir regra ativa para o **tipo de serviço L&T**, a base é o valor da linha da perna. O profissional sai do motorista da rota (`hub_pickup_stops` → `hub_pickup_routes.driver_staff_id`), e só depois que a perna foi colocada numa rota. Sem rota ou sem regra, comissão zero. O profissional do banho não leva comissão do transporte.

### Recorrência

L&T da visita é copiado para cada data (horários deslocados, 2420–2421) com o **mesmo** valor da criação. Não rebusca faixa nem distância depois.

Multi-pet + repetir + L&T: cada pet, cada data, recebe o par de pernas pelo preço cheio da visita. Quatro semanas, dois pets, fixture `round_trip` R$ 40: transporte gravado = 4 × 2 × 40 = **R$ 320,00**, mais os banhos. A prévia de **um** dia mostra o transporte uma vez (R$ 40).

### Caminho na UI

- Preço: Serviços → tipo no grupo Leva e Traz (matriz + «preço da ida e volta» vs «por perna»).
- Cobrança: Agenda → Novo agendamento → incluir Leva e Traz (visita ou serviço principal).
- Operação: `/hub/leva-e-traz` (rotas, motorista, monitoramento). Config de frota: `/hub/configuracoes-sistema/leva-e-traz`. Nenhum dos dois mexe no valor.

### Casos

**LT-1 — Pipoca, banho + ida e volta, escopo `round_trip`.** Faixa 0 (R$ 40).

- Prévia: Banho R$ 50,00 + L&T R$ 40,00 = **R$ 90,00**.
- Banco: pai Banho `sale_amount_applied = 50`; filho busca = 20; filho retorno = 20. Os filhos não têm `visit_group_id`; têm `parent_appointment_id`.
- Comanda aberta **no pai**: 1 linha Banho R$ 50,00. Transporte ausente.
- Caixa do dia, sem comanda: três linhas, 50 + 20 + 20 = **R$ 90,00**, se as três forem cobradas. Cobrar só o pai deixa R$ 40,00 de fora.

**LT-2 — só busca, mesmo escopo.** Prévia e banco: Banho 50 + **uma** perna de **R$ 20,00** (metade). Total **R$ 70,00**. Se o cadastro estiver `per_leg`, a perna única fica R$ 40,00 e o total **R$ 90,00**.

**LT-3 — escopo `per_leg`, ida e volta.** Prévia L&T **R$ 80,00** + banho 50 = **R$ 130,00**. Pernas 40 e 40.

**LT-4 — Pipoca e Thor, banho nos dois, ida e volta, `round_trip` R$ 40.**

- Prévia do modal: 50 + 80 + **40** = **R$ 170,00**.
- Banco (o que o caixa consegue cobrar): Pipoca 50+20+20 e Thor 80+20+20 = **R$ 210,00**.
- Comandas dos dois banhos: 50 e 80, sem transporte. Quatro pernas de R$ 20,00 ficam soltas no caixa, dois pares com o mesmo tutor e o mesmo horário de busca.

**LT-5 — L&T sozinho, ida e volta, R$ 40 `round_trip`.** Dois agendamentos `pickup_route` (ida no principal, volta no filho), R$ 20,00 cada. Duas comandas possíveis. A operação em `/hub/leva-e-traz` não altera esses 20.

**LT-6 — comissão.** Regra 10% no tipo L&T. Antes de montar a rota: recebível da perna de R$ 20,00 gera comissão **R$ 0,00** (sem motorista). Depois de atribuir motorista à rota que contém a parada daquela perna: comissão **R$ 2,00** para esse motorista. O tosador do banho não recebe esses R$ 2,00.

**LT-7 — bloco extra (não a visita) com faixa de km.** Serviço do bloco R$ 40 na matriz, `sale_amount` do tipo R$ 10.

- Esperado pela faixa: R$ 40 repartido.
- Gravado: base R$ 10 (`sale_amount`), repartida pelo escopo. Com `round_trip` e ida e volta, pernas de R$ 5,00.

---

## 4. Os três juntos

**X-1 — fixture completo, um dia.** Ana, Pipoca (P) e Thor (G), Banho nos dois, L&T ida e volta faixa R$ 40 `round_trip`, sem recorrência.

| Onde olhar | Pipoca | Thor | L&T | Total |
| --- | --- | --- | --- | --- |
| Prévia do modal | 50 | 80 | 40 uma vez | **170** |
| `sale_amount_applied` somado | 50 + 20 + 20 | 80 + 20 + 20 | (já nas pernas) | **210** |
| Comanda do banho de cada um | 50 | 80 | não entra | 130 |
| Caixa se cobrar pais e pernas | 90 | 120 | — | **210** |

**X-2 — o mesmo, repetido 4 semanas, cobrança Separado.**

- Prévia de um dia continua 170.
- Gravado no mês: 4 × 210 = **R$ 840,00** (banhos 4×130 = 520; transporte 4×80 = 320, porque cada pet leva a visita inteira).
- 2 séries. Cada série, em cada data: 1 pai + 2 pernas, todos com a `series_id` daquele pet.
- Cancelar o banho da Pipoca numa data pelo painel: o banho some; as duas pernas de R$ 20,00 dela **continuam** no caixa.
- Editar «Toda a série» no banho da Pipoca: as pernas de L&T dessa série podem perder a linha de transporte e ganhar a linha de Banho.

**X-3 — o mesmo com Fatura em série.**

- Duas faturas no mês (uma série por pet), cada uma somando banhos **e** pernas daquele pet.
- Fatura da Pipoca: 4 × (50+20+20) = **R$ 360,00**. Thor: 4 × (80+20+20) = **R$ 480,00**. Desconto 0 nas duas.
- Até a emissão, o caixa ainda mostra cada ocorrência e cada perna com valor cheio.

---

## 5. O que não está implementado

- Uma comanda por tutor ou por visita.
- Preço de serviço por peso, espécie ou quantidade de pets no transporte.
- Distância, geocode ou «grátis acima de X km» na taxa. A faixa é escolha manual.
- Status de falta (`no_show`) na agenda de banho/consulta.
- Cancelar um pet da visita em um gesto que também cancele as pernas de L&T dele.
- Destacar uma ocorrência da série.
- Editar regra, preço-base ou forma de cobrança da série depois de criada.
- Desconto na fatura mensal.
- Pacote / assinatura de pet como forma de cobrança da recorrência. Pacote é saldo de sessões. `/hub/assinatura` é o plano da clínica.
- Comissão automática para o profissional escalado no agendamento, sem `executed_by_staff_id`.
- Entrada da taxa de L&T na comanda do serviço pai.

Documento de apoio já existente, e mais estreito: `docs/architecture/HUB_AGENDA_PRICING_PORTE_QA.md` (porte/pelagem). O plano operacional de L&T (`HUB_PICKUP_DELIVERY_OPERATIONAL_PLAN.md`) descreve rota e parada; não descreve `pickup_price_scope`, comanda por perna nem multi-pet.
