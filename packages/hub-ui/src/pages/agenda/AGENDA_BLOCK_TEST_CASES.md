# Casos de teste — agenda por bloco (grupo, hotel/creche, recorrência, L&T)

Catálogo vivo dos cenários do dia a dia. IDs estáveis para implementação e QA.

## A. Um grupo por bloco

| ID | Cenário | Esperado |
|----|---------|----------|
| A1 | Bloco com banho + tosa (mesmo grupo) | OK |
| A2 | Bloco com banho + consulta clínica | Bloqueia |
| A3 | Bloco hotel + 2º serviço hotel | OK |
| A4 | Bloco hotel + serviço banho | Bloqueia |
| A5 | Extra: muda grupo após já ter serviço | Mantém grupo fixo |
| A6 | Edição legado com grupos misturados | Avisa; salvar exige homogeneizar |

## B. Hotel (entrada / saída)

| ID | Cenário | Esperado |
|----|---------|----------|
| B1 | Hotel multi-dia | `hotel_stay`; sem «Repetir» |
| B2 | Hotel com recorrência | Bloqueado |
| B3 | Saída ≤ entrada | Erro |
| B4 | Hotel + pet | Reserva boarding `reserved` |
| B5 | Hotel sem pet | Não cria reserva |
| B6 | Label data com hotel | «Data de entrada» |
| B7 | Abrir reserva (check-in) | Idempotente |

## C. Creche

| ID | Cenário | Esperado |
|----|---------|----------|
| C1 | Creche integral | `daycare_block` + `full_day` |
| C2 | Creche meio período | `half_day` |
| C3 | Creche recorrência semanal | Série do bloco |
| C4 | Creche + banho no mesmo create | OK com blocos independentes |

## D. Recorrência por bloco

| ID | Cenário | Esperado |
|----|---------|----------|
| D1 | Só Bloco 1 quinzenal | Série só do principal |
| D2 | Bloco 1 pontual + Bloco 2 banho 15d | Séries distintas |
| D3 | Hotel 30d + banho quinzenal | 1 hotel + N banhos |
| D4 | Dois blocos weekly vs monthly | Duas `series_id` |
| D5 | Extra sem recurrence + pai com | Extra não clona com série do pai |
| D6 | Fatura em série no bloco | Billing só daquela série |

## E. Leva e traz por bloco

| ID | Cenário | Esperado |
|----|---------|----------|
| E1 | L&T só no Bloco 1 | Pernas do principal |
| E2 | L&T só no Bloco 2 | Pernas do extra |
| E3 | L&T nos dois | Dois pares (intencional) |
| E4 | Principal = leva_traz | Standalone |
| E5 | Principal L&T + anexar L&T | Rejeita |
| E6 | Hotel + L&T no hotel | Relativo à janela |
| E7 | Sem L&T no rodapé órfão | Só nos cards / visita |

## F. Combinações do dia a dia

| ID | Cenário | Esperado |
|----|---------|----------|
| F1 | Banho + addon + L&T | Um bloco |
| F2 | Banho + consulta (2 blocos) | `visit_group_id` |
| F3 | Walk-in clínico | Sem hotel range |
| F4 | Multi-pet | Batch |
| F5 | Pacote + recorrência | Prefill; hotel sem repetir |
| F6 | Conflito em ocorrência | 409 / lista |
| F7 | Encaixe emergência | kind emergency |

## G. API / contrato

| ID | Cenário | Esperado |
|----|---------|----------|
| G1 | Sem independent + hotel + extra | 400 isolamento |
| G2 | Independent + hotel + banho | 201 |
| G3 | Linhas com 2 groups | 400 |
| G4 | Extra recurrence hotel | 400 |
| G5 | Inferência kinds | hotel/creche/L&T |
| G6 | Extra com recurrence + pickup | Série/L&T do extra |

## H. Regressões

| ID | Cenário | Esperado |
|----|---------|----------|
| H1 | Banho simples | Fluxo clássico |
| H2 | Patch extra_blocks só `scope=this` | Mantém |
| H3 | Série: scope future/all | Intactos |
| H4 | Addons banho/tosa | Mesmo bloco |

## I. L&T da visita (um transporte para vários blocos)

| ID | Cenário | Esperado |
|----|---------|----------|
| I1 | Banho + consulta, L&T da visita, sem repetir | 1 busca + 1 retorno; sem L&T nos cards extras |
| I2 | Mesmos blocos, L&T da visita, repetir visita weekly | Todos os blocos com a **mesma** assinatura de ritmo; L&T clona com a série do pai |
| I3 | L&T da visita + pai weekly + extra sem repetir | Bloqueia (ritmo misto) **ou** UI espelha a repetição do pai nos extras |
| I4 | L&T da visita + pai weekly + extra biweekly | Bloqueia `PICKUP_VISIT_RHYTHM_MESSAGE` |
| I5 | Extra com L&T próprio + tentar L&T da visita | Mutex; esconde/desliga visita |
| I6 | Hotel 30d + banho 15d | Sem L&T da visita; L&T só por bloco (se houver) |
| I7 | L&T da visita ligado | Label «da visita»; repetição dos extras oculta/espelhada |
| I8 | Sem L&T da visita + extras com ritmos diferentes + L&T no bloco do banho | OK (modo por bloco) |

## Camadas

1. Unit `appointmentBlockRules` — A, I, partes de B/C/E  
2. Unit `buildExtraBlocksApiPayload` — B/D payload  
3. Integration create appointment — D3, G, I2–I4, B4  
4. UI — E7, I7 (sem rodapé órfão; label visita)
