# Manual de uso — Agenda (PetiMi Hub)

Documento para equipes da clínica (recepção, coordenação e operação).  
Objetivo: explicar **como usar a Agenda no dia a dia**, com regras que evitam cobrança duplicada, conflito de horário e perda de série recorrente.

**Onde acessar:** menu **Agenda** (rota `/hub/appointments`).

---

## 1. O que é a Agenda

A Agenda é o **calendário operacional** da clínica. Nela você:

- marca atendimentos futuros e **encaixes** (cliente que chegou sem hora);
- vê a carga do **dia**, da **semana** e do **mês**;
- organiza **profissional**, **recurso/sala**, **pet**, **tutor** e **serviços**;
- inicia o fluxo do dia (**check-in**, fila de Banho & Tosa, clínica, hotel);
- abre a **comanda** para cobrança no Caixa;
- cria e **renova séries recorrentes** (ex.: banho toda semana).

A Agenda **não substitui** o prontuário nem o Caixa. Ela é o ponto de partida: agenda → operação → cobrança.

---

## 2. Visão geral da tela

### 2.1 Vistas

| Aba | Uso recomendado |
|-----|-----------------|
| **Dia** | Operação do plantão: grade por colunas (desktop) ou lista por horário (celular). |
| **Semana** | Planejamento da semana; células com até 3 cards e atalho **+N atendimento(s)**. |
| **Mês** | Visão mensal com contagem por dia; clique no dia abre a vista **Dia**. |

Na vista **Semana** podem aparecer contadores extras, como **Hotel** e **Leva e traz**.

### 2.2 Navegação

- Setas para período **anterior** / **próximo**.
- Seletor de data.
- Botão **Agora**: volta para hoje e destaca a linha do horário atual na vista diária.
- Métricas do período: quantidade de **atendimentos**, **pets**, horas estimadas e, se houver, **conflito(s)**.
- Campo de busca: **Pet, tutor, serviço…**
- A tela **atualiza sozinha** periodicamente enquanto a aba do navegador estiver aberta.

### 2.3 Filtros

Na seção **Filtros** você pode restringir por:

- **Unidade** (Todas, uma unidade específica ou **Clínica parceira**)
- **Profissional** (Todos, um nome ou **Não atribuído**)
- **Grupo de serviço** (Banho & Tosa, Hotel, Creche, Clínica, Cirurgia, Leva e Traz, Internação, Outros etc.)
- **Recurso / sala**
- **Tipo de serviço**
- **Status**
- **Colunas / linhas** da grade: **Profissional** | **Categoria** | **Recurso**

Os filtros ficam lembrados na sessão do navegador.

### 2.4 Interação na grade (Dia)

- Clique em um horário **vazio** → abre **Novo agendamento** já com data, horário e (quando houver) profissional/recurso.
- Arraste um card **editável** para mudar horário (e, conforme o agrupamento, profissional ou recurso).
- A cor do card segue o **grupo de serviço** (veja a legenda **Grupos**).

---

## 3. Quem pode fazer o quê

Os botões aparecem ou somem conforme a permissão do usuário. Em geral:

| Ação | Quem costuma poder |
|------|--------------------|
| Ver a Agenda | Equipe com acesso de leitura à agenda |
| **+ Novo**, editar, cancelar, arrastar, renovar série | Quem agenda (recepção / assistente / coordenação) |
| **Abrir comanda** | Quem pode criar cobrança no Caixa |
| **Ver comanda** | Quem tem acesso financeiro de leitura **ou** pode criar cobrança |
| Abrir atendimento na **Clínica** | Perfil clínico com permissão de escrita |
| **Abrir na fila B&T** | Quem gerencia a fila de Banho & Tosa |
| **Abrir reserva** (Hotel & Creche) | Quem gerencia reservas de hotel/creche |

Se um botão não aparecer, peça ao administrador da clínica para revisar o perfil do usuário.

---

## 4. Criar um agendamento

### 4.1 Entrada

Botão **+ Novo** (menu com duas opções):

| Opção | Quando usar |
|-------|-------------|
| **Agendamento** | Data e horário futuros |
| **Encaixe** | Cliente chegou agora; check-in imediato |

### 4.2 Preencher o modal **Novo agendamento**

Ordem sugerida:

1. **Data** e **Situação** (status inicial; o padrão é **Confirmado**).
2. **Tutor** (*Buscar tutor…*) e **Pet** (*Selecionar pet…*).  
   Se ainda não estiverem cadastrados: **Cadastrar tutor e pets** ou **Cadastrar outros pets** (cadastro rápido).
3. **Grupo de serviço** e **Serviços** (*Buscar e adicionar serviço…*).
4. **Início** e **Fim previsto** (a duração dos serviços ajuda a calcular o fim).
5. **Profissional** (ou **Não atribuído**) e **Recurso / Sala** (ex.: Mesa 1, Van…).
6. Se necessário: **Título do bloco**, **Descrição do bloco**, notas.
7. Opcionais:
   - **Adicionar outro bloco no dia** (segundo horário/serviços no mesmo dia);
   - **Incluir Leva e Traz**;
   - **Repetir agendamento** (série).
8. Conferir o **Resumo** (blocos, preços estimados, horário, repetição).
9. Salvar com:
   - **Criar agendamento**, ou
   - **Criar série** (se houver recorrência), ou
   - **Registrar encaixe** (walk-in).

Depois de criar (exceto encaixe), o sistema pode oferecer: **Novo agendamento** | **Ir ao Caixa** | **Voltar à agenda**.

### 4.3 Cadastro rápido na recepção

Útil quando o cliente chega sem cadastro:

- Tipo **Pessoa** ou **Empresa**
- Nome, telefone, CPF/CNPJ, endereço (CEP com busca automática — importante para leva e traz)
- Pets: nome, espécie, raça/SRD, porte etc.
- **Salvar** e seguir com o agendamento

### 4.4 Vários pets do mesmo tutor (multi-pet)

Na **criação** de agendamento normal (não encaixe e não “consulta de rotina”), você pode selecionar **2 ou mais pets** do mesmo tutor.

Opções úteis:

- **Mesmos serviços para todos**
- **Mesmo profissional para todos**

O card na grade pode mostrar o badge **N pets** (*Visita multi-pet*).  
Cada pet fica em um bloco; horários podem ser ajustados individualmente.

> **Regra:** multi-pet **não** está disponível na edição, no encaixe nem no fluxo de consulta de rotina.

### 4.5 Encaixe (walk-in)

Use quando o cliente **já está na clínica**.

1. **+ Novo** → **Encaixe**
2. Preencha tutor, pet e serviço
3. Em atendimento clínico, se fizer sentido: marque **Urgência / emergência** e o **Local do atendimento**
4. **Registrar encaixe**

**Regras do encaixe:**

- O horário fica no momento atual.
- O status já entra como **Aguardando** (check-in imediato).
- Em seguida, no painel: **Iniciar atendimento**, **Abrir na fila B&T** ou **Abrir reserva**, conforme o serviço.

### 4.6 Leva e Traz

Há duas formas:

- Serviço principal do grupo **Leva e Traz**, ou
- Checkbox **Incluir Leva e Traz** junto a outro serviço (busca e/ou retorno).

Modos comuns: **Ida e volta**, **Só busca**, **Só retorno**.  
O endereço do tutor ajuda o cálculo; mantenha o cadastro atualizado.

---

## 5. Séries recorrentes

### 5.1 Quando usar

Banho semanal, consultas periódicas, rotinas que se repetem com a mesma regra.

### 5.2 Como criar

1. No modal, marque **Repetir agendamento**.
2. Escolha a frequência:
   - **Diária**
   - **Semanal**
   - **Quinzenal** (*A cada 2 semanas*)
   - **Mensal**
3. Se não for quinzenal, informe **A cada** (1 a 12).
4. Nos modos semanais, marque os dias: **Seg Ter Qua Qui Sex Sáb Dom**.
5. Defina o término:
   - **Após N ocorrências** (máximo **52**; padrão sugerido: 4), ou
   - **Até data**
6. Escolha **como cobrar a série** (veja abaixo).
7. Clique em **Criar série**.

**Regras importantes:**

- Séries são **finitas**. Todas as datas já nascem criadas na Agenda.
- O limite máximo é **52** ocorrências por série.
- Se alguma data conflitar, o sistema lista *Algumas datas entraram em conflito* e pode criar só as que forem possíveis.

### 5.3 Cobrança da série

Pergunta na tela: *Como quer cobrar esta série?*

| Opção | Significado |
|-------|-------------|
| **Separado** | Cada dia gera cobrança no caixa, como um agendamento avulso. |
| **Fatura em série** | As datas continuam na Agenda; a cobrança é **agrupada no mês**. |

Com **Fatura em série**, configure:

- **Emitir em:** *1º dia útil do mês* ou *Dia fixo do mês*
- **Vencimento:** *Mesmo dia da emissão*, *Emissão + N dias* ou *Dia fixo do mês*

> **Regra:** fatura em série **não remove** as datas da Agenda. Só muda a forma de cobrar.

### 5.4 Editar ou remarcar uma série

Ao alterar um item que faz parte de série, o sistema pergunta o escopo:

- **Só este agendamento**
- **Este e os futuros**
- **Toda a série**

**Regras:**

- Blocos adicionais no dia só são salvos se você escolher **Só este agendamento**.
- A troca rápida de profissional também pede o mesmo tipo de escopo.

### 5.5 Renovar série que está acabando

O Hub alerta quando a série está terminando, se:

- restam **2 ou menos** ocorrências futuras, **ou**
- a **última** ocorrência futura está em até **7 dias**.

**Onde aparece:**

1. Banner no topo: **Séries recorrentes a terminar**  
   Texto exemplo: *A série de [título] termina em breve (N restante(s)).*  
   Botão **Renovar**
2. No painel do agendamento: **Série recorrente a terminar** → **Renovar série**

**O que a renovação faz:**

1. Abre o modal **Novo agendamento** com tutor, pet, serviços e recorrência sugeridos.
2. Você confere e salva com **Criar série**.
3. Isso cria uma **nova** série (novo ciclo). **Não** estende a série antiga.

> **Boa prática:** treine a recepção a renovar assim que o banner aparecer, para não “furar” a rotina do cliente.

---

## 6. Status e ações do dia

### 6.1 Status possíveis

| Status na tela | Significado operacional |
|----------------|-------------------------|
| **A confirmar** | Ainda precisa confirmação do cliente ou da clínica |
| **Confirmado** | Marcado; aguarda o dia |
| **Aguardando** | Cliente fez check-in / encaixe |
| **Em atendimento** | Serviço em andamento |
| **Finalizado** | Operação concluída |
| **Cancelado** | Não será realizado |
| **Pago** | Situação financeira associada ao fluxo |

### 6.2 Ações principais no painel

Abra o card do agendamento. Conforme o status, aparecem ações como:

| Situação | Ação típica | Outras ações |
|----------|-------------|--------------|
| A confirmar | **Confirmar** | Abrir/Ver comanda, **Cancelar**, **Duplicar** |
| Confirmado | **Check-in** | Abrir/Ver comanda, **Cancelar**, **Duplicar** |
| Aguardando | **Iniciar atendimento** / **Abrir na fila B&T** / **Abrir reserva** / **Concluir** | Comanda, cancelar etc. |
| Em atendimento | Continuar no módulo / **Concluir** | Comanda |
| Finalizado | **Abrir/Ver comanda** | **Duplicar** |
| Pago ou Cancelado | **Duplicar** | — |

Confirmação de cancelamento: *Cancelar este atendimento?* → **Cancelar**.

### 6.3 Quando é permitido editar

A edição completa (lápis **Editar agendamento** / *Editar horário, serviços e demais detalhes*) só fica disponível quando:

- o usuário tem permissão de escrita na agenda;
- o status é **A confirmar** ou **Confirmado**;
- o horário de **início ainda não passou**.

Depois disso, use as ações de status (check-in, concluir, módulos) e, se necessário, ajuste financeiro no Caixa.

### 6.4 Arrastar na grade

Mesmas regras de editabilidade. Se houver conflito de horário:

- aviso **Horário em conflito**
- opções **Agendar mesmo assim** ou **Voltar e ajustar**

> **Regra:** o sistema **avisa** o conflito, mas não impede de forma absoluta. A clínica decide se agenda mesmo assim.

### 6.5 Depois do check-in

Dependendo do serviço e da permissão:

- **Clínica:** Abrir / Continuar na Clínica
- **Banho & Tosa:** **Abrir na fila B&T** (toast: *Pet adicionado à fila de Banho & Tosa.*)
- **Hotel & Creche:** **Abrir reserva** (toast: *Reserva aberta no Hotel & Creche.*)

---

## 7. Preços na Agenda

### 7.1 Preço estimado do serviço

No card do serviço, o Hub mostra **Preço estimado** e, quando o serviço tem tabela, opções como:

- **Porte** e/ou **Pelagem** (incluindo **Automático**)
- Tabelas por **km**, **período** (dia / meio período), **consulta** (padrão / retorno) etc.

Dicas:

- *Filhote nesta clínica: até N meses na data do agendamento* (configuração em Serviços → agenda/preços de filhotes).
- Se a matriz exigir pelagem e o pet não tiver no cadastro, complete a pelagem ou informe o override no agendamento.

### 7.2 Preços especiais (acordo comercial)

Com o pet selecionado, você pode:

- **Adicionar valor especial** / **Usar valor especial neste serviço**
- Marcar se vale **só neste agendamento** ou **Salvar para os próximos agendamentos deste pet**
- Ver acordos já existentes: *Acordo deste pet*, *Acordo do tutor*, *Plano família*

**Prioridade de preço (regra do sistema):**

1. Preço especial do **pet**
2. **Plano família** (se o pet for membro)
3. Preço especial do **tutor**
4. Catálogo / matriz do serviço

> **Regra:** quem não tem permissão financeira pode gravar acordo que fica **pendente de aprovação** do financeiro. Até aprovar, o valor especial pode não valer como definitivo no caixa.

### 7.3 Notas financeiras

Use o campo de notas do resumo / painel (**Notas financeiras**, badge **interno**) para combinações do tipo desconto verbal, observação para o caixa etc.  
Essas notas são **internas** — não são o prontuário do pet.

### 7.4 Snapshot

O valor estimado no momento do agendamento fica registrado nas linhas do atendimento. Isso ajuda o Caixa a cobrar o que foi combinado na hora da marcação.

---

## 8. Comanda e cobrança a partir da Agenda

### 8.1 Abrir ou ver comanda

No painel do agendamento:

| Botão | Quando |
|-------|--------|
| **Abrir comanda** | Ainda não existe comanda ligada |
| **Ver comanda** | Já existe / você só precisa consultar |

Também é possível ir ao Caixa logo após criar o agendamento (**Ir ao Caixa**).

**Regras:**

1. **Agendar não cobra automaticamente.** A cobrança exige ação explícita (comanda / Caixa), salvo fluxos específicos de fatura em série configurados.
2. Se já existir comanda aberta para aquele agendamento, o sistema orienta a abrir a existente (não cria duplicata).
3. Para abrir comanda, selecione uma **unidade** (filtro da Agenda ou cabeçalho). Sem unidade: *Selecione uma unidade…*
4. Se o atendimento for cancelado depois de pagamento antecipado, pode surgir o badge **Ajuste financeiro pendente**. Resolva no **Caixa** (**Ver no Caixa**).

### 8.2 Fluxo sugerido no dia

1. Confirmar / check-in do pet  
2. Encaminhar ao módulo operacional (clínica, B&T, hotel)  
3. **Abrir comanda** (se ainda não houver)  
4. Cobrar no Caixa  
5. Concluir o atendimento na Agenda, se ainda estiver aberto

---

## 9. Alertas e badges importantes

| Alerta | O que fazer |
|--------|-------------|
| **Séries recorrentes a terminar** | Clicar em **Renovar** e criar a nova série |
| **Série recorrente a terminar** (painel) | Idem: **Renovar série** |
| **Conflito de horário** | Revisar profissional/recurso/horário; só force se a clínica aceitar |
| **Ajuste financeiro pendente** | Ir ao Caixa e resolver reembolso, crédito ou manter cobrança |
| Badge **Encaixe** / **Emergência** | Priorizar no fluxo do dia |
| Badge **Leva e traz** | Conferir busca/retorno |
| Badge de série / multi-pet / parceira | Identificar visita especial ou unidade parceira |

Tags de comportamento do pet (quando cadastradas na ficha) ajudam a equipe no painel. Alertas clínicos detalhados ficam no módulo **Clínica**, não como banner principal da Agenda.

---

## 10. Bloqueios de calendário (feriados e fechamentos)

Na vista **Mês**, dias especiais podem aparecer com chip **Feriado** ou outro rótulo de bloqueio (fechamento, equipe reduzida etc.).

> **Limitação atual:** a Agenda **exibe** esses bloqueios. A gestão completa (cadastrar/editar/apagar) pode não estar disponível nesta tela. Em caso de dúvida, fale com o suporte PetiMi ou o administrador da conta.

Não confundir com **Adicionar outro bloco no dia** no modal de agendamento: isso é um **segundo horário** do mesmo pet no mesmo dia, não um feriado.

---

## 11. Regras resumidas (checklist para a clínica)

1. **Agendar ≠ cobrar.** Use **Abrir comanda** / Caixa de forma consciente.  
2. Série tem no máximo **52** ocorrências; ao acabar, **Renovar** cria série **nova**.  
3. Conflito de horário: o Hub **avisa**; a clínica decide se agenda mesmo assim.  
4. Edição completa só em **A confirmar/Confirmado** e **antes** do início.  
5. Encaixe já entra como **Aguardando**.  
6. Multi-pet: só na criação; mesmo tutor.  
7. Preço especial permanente pode exigir **aprovação financeira**.  
8. Prioridade de preço: pet → plano família → tutor → catálogo.  
9. Cancelamento com pagamento antecipado → tratar **Ajuste financeiro pendente** no Caixa.  
10. Fatura em série mantém as datas na Agenda e agrupa a cobrança no mês.  
11. Trabalhe sempre com a **unidade** correta no filtro.  
12. Renove séries assim que o banner aparecer (≤2 restantes ou última em ≤7 dias).

---

## 12. Fluxos prontos (passo a passo)

### A) Agendar banho futuro

1. Agenda → **+ Novo** → **Agendamento**  
2. Tutor e pet (ou cadastro rápido)  
3. Grupo Banho & Tosa + serviço(s); ajuste porte/pelagem se pedido  
4. Horário, profissional e sala  
5. Opcional: Leva e Traz ou **Repetir agendamento**  
6. **Criar agendamento** → **Voltar à agenda** ou **Ir ao Caixa**

### B) Cliente chegou sem hora

1. **+ Novo** → **Encaixe**  
2. Tutor, pet, serviço  
3. Se for urgência clínica: marque **Urgência / emergência**  
4. **Registrar encaixe**  
5. No painel: iniciar atendimento ou abrir fila/reserva  
6. **Abrir comanda** quando for cobrar

### C) Série semanal e renovação

1. Novo agendamento → **Repetir agendamento** → Semanal + dias + N ocorrências  
2. Escolha **Separado** ou **Fatura em série**  
3. **Criar série**  
4. Quando aparecer o banner → **Renovar** → conferir dados → **Criar série** novamente

### D) Check-in e cobrar

1. Abrir o card → **Check-in**  
2. Encaminhar ao módulo (Clínica / B&T / Hotel)  
3. **Abrir comanda** → cobrar no Caixa  
4. **Concluir** o atendimento na Agenda, se aplicável

### E) Remarcar ou cancelar

1. Abrir o painel  
2. Se editável: lápis **Editar** ou arrastar na grade  
3. Se for série: escolher o escopo (só este / futuros / toda a série)  
4. Ou **Cancelar** → confirmar  
5. Se houver pagamento antecipado, resolver o ajuste no Caixa

### F) Vários pets do mesmo tutor

1. Selecionar vários pets  
2. Marcar **Mesmos serviços** / **Mesmo profissional** se quiser  
3. Ajustar horários por pet se necessário  
4. **Criar agendamento**

### G) Veio de orçamento ou pacote

1. A Agenda abre já com tutor/pet/serviços pré-preenchidos (toast de Orçamentos/Pacotes)  
2. Completar data, profissional e demais detalhes  
3. Salvar normalmente

---

## 13. Boas práticas de operação

- Confirme telefones e pets no **cadastro rápido** antes de salvar a série longa.  
- Use filtros de **Profissional** e **Grupo** no horário de pico.  
- No celular, prefira a vista **Dia** (lista) para check-in rápido.  
- Padronize na clínica: quem faz check-in, quem abre comanda e quem aprova preço especial.  
- Trate o banner de **série a terminar** como tarefa diária da recepção.  
- Não ignore **Ajuste financeiro pendente** — evita saldo “preso” no Caixa.

---

## 14. Problemas frequentes

| Situação | O que verificar |
|----------|-----------------|
| Não aparece **+ Novo** | Permissão de escrita na agenda |
| Não edita o horário | Status já passou de Confirmado, ou horário de início já passou |
| Não abre comanda | Unidade selecionada? Permissão de criar cobrança? |
| Preço “estranho” | Matriz de porte/pelagem, acordo especial ou override do agendamento |
| Série “sumiu” do futuro | Séries são finitas; use **Renovar série** |
| Conflito ao criar série | Veja a lista de datas em conflito e ajuste profissional/recurso |
| Cliente cancelou com pagamento feito | Badge de ajuste → resolver no Caixa |

---

## 15. Glossário rápido

| Termo | Significado |
|-------|-------------|
| **Encaixe** | Atendimento sem marcação prévia; check-in imediato |
| **Bloco** | Trecho de horário/serviços no dia (pode haver mais de um) |
| **Série** | Conjunto finito de agendamentos gerados por uma regra de repetição |
| **Comanda** | Documento de cobrança ligado ao atendimento/agendamento |
| **Snapshot de preço** | Valor estimado gravado na hora da marcação |
| **Preço especial** | Acordo comercial (pet, tutor ou plano família) |
| **Fatura em série** | Cobrança mensal agrupada, sem apagar as datas da Agenda |

---

*Documento de uso do PetiMi Hub — módulo Agenda. Em caso de divergência com a versão instalada na clínica, prevalece o comportamento da tela e a orientação do suporte PetiMi.*
