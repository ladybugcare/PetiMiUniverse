# PetMi Hub — Regras de negócio do módulo Clínica

**Versão:** 1.0  
**Status:** fonte oficial de verdade para produto, arquitetura e implementação futura  
**Escopo:** módulo Clínica (prontuário, casos, atendimentos, internação, cirurgia, exames, prescrições, vacinas, timeline, integração com agenda e financeiro)  
**Público:** PM, veterinário responsável técnico, gestão de clínica, arquitetura de produto, engenharia  

Este documento consolida o plano de reformulação da Clínica (Pet → Prontuário → Casos clínicos → Eventos), as decisões já aprovadas pelo produto e recomendações formais onde havia lacuna. **Não substitui** legislação, CFMV ou normas fiscais: onde houver conflito, prevalece a lei e o contador da clínica.

---

## 0. Glossário

| Termo | Significado |
|--------|-------------|
| **Pet** | Animal atendido (`hub_pets`). |
| **Tutor** | Responsável/guardião (`hub_guardians`). |
| **Caso clínico** | Episódio de cuidado que agrupa atendimentos e demais entidades clínicas. |
| **Atendimento** | Episódio de consulta/procedimento no tempo (`hub_encounters`); sempre filho de um caso. |
| **Timeline clínica** | Ledgers de marcos relevantes (`hub_clinical_timeline_events` e, quando aplicável, eventos específicos de internação). |
| **Comanda** | Documento operacional de cobrança ao tutor; origem pode ser atendimento, pet, orçamento convertido, etc. |
| **Recebível / cobrança** | Camada financeira formal; nasce após regras de checkout, não na conversão de orçamento. |

---

## 1. Caso clínico

### 1.1 Objetivo

Dar **continuidade clínica e operacional** a um episódio de cuidado (agudo, crônico ou preventivo), permitindo retornos, exames e internações no **mesmo fio narrativo**, sem misturar episódios distintos por engano.

### 1.2 Conceitos

- O caso representa um **episódio de cuidado**, não um único atendimento.
- Todo atendimento **obrigatoriamente** pertence a **um** caso.
- Um caso pode conter: atendimentos (incluindo retornos), exames, prescrições, vacinas, internações, cirurgias, anexos e evoluções (notas livres relevantes ou marcos clínicos).

### 1.3 Regras

1. **Criação automática:** se o pet **não** possui caso em status `active` ou `monitoring`, o sistema **cria um caso automaticamente** ao criar o atendimento (título padrão editável, ex.: queixa principal ou “Atendimento”).
2. **Casos ativos simultâneos:** se o pet possui **um ou mais** casos em `active` ou `monitoring`, o sistema **deve perguntar** explicitamente: **associar a um caso existente** ou **criar novo caso**. **Proibido** associar automaticamente a um caso ativo.
3. **Motivo:** um pet pode ter casos paralelos legítimos (ex.: oncologia + vacinação; dermatite + cardiologia; pós-operatório + gastroenterite aguda).
4. **Status permitidos:** `active`, `monitoring`, `resolved`, `cancelled`.
5. **`resolved`:** ao encerrar como resolvido, registrar **opcionalmente** `resolved_reason` com valores sugeridos: alta, cura, tratamento concluído, acompanhamento encerrado, outro (livre quando “outro”).
6. **Reabertura:** casos `resolved` podem ser reabertos, desde que: apenas **perfis autorizados**; **motivo obrigatório**; registro em **auditoria**; registro na **timeline** (`case_reopened` + atualização de status).
7. **`cancelled`:** uso para erro de abertura, desistência ou duplicidade; não substitui `resolved` clinicamente.

### 1.4 Fluxos

**Fluxo A — Pet sem caso ativo/monitoramento**  
Novo atendimento → sistema cria caso → vincula atendimento.

**Fluxo B — Pet com caso(s) ativo(s)**  
Novo atendimento → diálogo “Associar a qual caso?” ou “Criar novo caso” → escolha obrigatória antes de prosseguir (salvo política de rascunho: a escolha deve estar resolvida antes de **finalizar** o check-in clínico).

**Fluxo C — Retorno**  
Novo atendimento tipo retorno (ver secção Atendimento) **no mesmo caso** quando for continuidade do mesmo episódio; **novo caso** se for novo episódio (escolha explícita).

**Fluxo D — Encerramento**  
Profissional altera status para `resolved` (com motivo opcional) ou `cancelled` → `closed_at` preenchido conforme modelo de dados.

**Fluxo E — Reabertura**  
Autorizado informa motivo → sistema reabre (ex.: volta a `active` ou `monitoring`) → timeline + auditoria.

### 1.5 Exceções

- **Urgência extrema:** se o fluxo de triagem permitir “atendimento mínimo” antes do tutor, o caso ainda deve existir ou ser criado assim que houver pet identificável; tutor pode ser exigido antes de **comanda/checkout** (ver conflitos).

### 1.6 Permissões

- Criar/editar/fechar/reabrir caso: **veterinário** e **administrador** (detalhamento na secção Permissões).
- Recepção: **não** edita caso nem vê conteúdo clínico sensível (apenas o permitido em recepção).

### 1.7 Impactos financeiros

- Indiretos: o caso agrupa episódio; **comandas** podem ser listadas por caso no futuro para conciliação. O orçamento aprovado **cria caso** mas **não** cria comanda (secção Orçamento).

### 1.8 Impactos em estoque

- Nenhum direto no caso; baixas vinculam-se a **atendimento**, **internação**, **cirurgia** ou **venda/comanda** conforme matriz de estoque.

### 1.9 Impactos em timeline

- `case_opened`, `case_status_changed`, `case_reopened` (e variantes acordadas na secção Timeline).

### 1.10 Perguntas futuras

- Política de **mesclar casos** duplicados (pós-go-live).
- **Prioridade** de caso (removida na v1 do plano; reavaliar se fila operacional precisar).

---

## 2. Atendimento

### 2.1 Objetivo

Registrar o **contato clínico** (presencial ou telemedicina futura) com documentação, responsável e vínculo a agenda/comanda quando aplicável.

### 2.2 Conceitos

- Todo atendimento pertence a: **pet**, **tutor** (recomendado como obrigatório antes de encerramento financeiro; ver conflitos), **caso clínico**.
- O atendimento é um **evento** dentro do caso na narrativa de produto (na implementação permanece entidade própria `hub_encounters`).

### 2.3 Regras

1. Tipos de atendimento aprovados conceitualmente: **consulta**, **retorno**, **emergência**, **procedimento**, **vacinação**, **internação**, **cirurgia**, **preventivo**.
2. **Inconsistência a resolver na implementação:** o modelo técnico atual de `encounter_type` pode estar restrito a um subconjunto (ex.: consulta, retorno, emergência, procedimento). É necessário **alinhar enum/campos** para suportar vacinação, internação, cirurgia e preventivo **ou** mapear estes para `procedure` + metadados (`clinical_service_kind`). Até o alinhamento, este documento prevalece como **regra de produto**.
3. **Retorno:** deve ser identificável como retorno para relatórios e para UX (continuidade no mesmo caso).

### 2.4 Fluxos

Walk-in ou agenda → seleção de caso (se aplicável) → atendimento em `waiting`/`in_progress` → registro clínico → **finalizado** → oferta de comanda/checkout conforme política da clínica.

### 2.5 Exceções

- Atendimento **cancelado** não gera cobrança automática; impactos em timeline devem ser explícitos (`encounter_cancelled` avaliar inclusão na secção Timeline).

### 2.6 Permissões

- Veterinário: dono dos dados clínicos do atendimento.
- Recepção: abrir **fila**/dados cadastrais; não ver diagnóstico/prescrição/exames/evolução.
- Enfermagem: evolução em contexto de internação conforme secção Internação.

### 2.7 Impactos financeiros

- Comanda pode originar-se do atendimento **após ação explícita** ou configuração da clínica (secção Comanda).

### 2.8 Impactos em estoque

- Vacinas e medicamentos administrados no **atendimento** seguem matriz de estoque.

### 2.9 Impactos em timeline

- `encounter_created`, `encounter_completed`, `encounter_amended` (+ cancelamento se aprovado na lista fechada).

### 2.10 Perguntas futuras

- Teleconsulta e gravação de **consentimento**.
- **Assinatura** digital no ato do atendimento (fora do escopo deste documento).

---

## 3. Atendimentos preventivos e bem-estar (análise formal)

Contexto: vacinação, vermifugação, antiparasitário, microchipagem, check-up. Clínicas PME misturam **preventivo** com **caso clínico agudo** no mesmo dia em pets com doenças ativas.

### 3.1 Devem gerar caso clínico?

**Sim.** Pela regra global aprovada, **todo atendimento** exige caso. O preventivo não é exceção: evita atendimentos “órfãos” de arquitetura e mantém vacinas e exames de rotina na **timeline** correta.

### 3.2 Devem reutilizar caso existente?

**Somente se o usuário escolher explicitamente** — mesma regra dos demais atendimentos. **Nunca** automático.  
Ex.: pet com caso ativo de oncologia: na vacina, o sistema pergunta; o esperado na maioria das vezes é **novo caso** focado em preventivo ou **caso de programa** (ver abaixo).

### 3.3 Deve existir um tipo especial de “caso preventivo”?

**Não como entidade separada obrigatória.** Recomenda-se **classificar** o caso com **tag** ou **metadata** (ex.: `care_focus: preventive` ou tag “Preventivo”) mantendo os **mesmos** status `active | monitoring | resolved | cancelled`.

**Opcional de produto (fase posterior):** “**Programa preventivo**” = um caso em `monitoring` por pet (“Bem-estar e rotina”) onde a clínica **opta** por concentrar vacinas/vermífugos; **sempre** associação **manual** a esse caso.

### 3.4 Recomendação ideal PetMi Hub

| Situação | Comportamento |
|----------|----------------|
| Pet **sem** caso `active`/`monitoring` | Criar **automaticamente** caso com título sugerido, ex.: “Preventivo — vacinação”, “Check-up anual”, editável. |
| Pet **com** caso(s) ativo(s) | **Perguntar**: associar a qual caso **ou** criar novo; default de UX pode sugerir **novo caso** para preventivo quando detectado serviço preventivo na agenda, **sem** auto-selecionar. |
| Crônico + rotina | Tutor/vet escolhe: **novo caso preventivo** (recomendado para clareza) **ou** associação explícita ao caso de doença apenas se a clínica quiser unificar (caso raro). |

**Prós:** aderência às regras de segurança (não misturar oncologia com vacina por engano); prontuário organizado.  
**Contras:** mais casos na lista (mitiga com filtros “Preventivo”, arquivamento, renomeação).  
**Alternativa rejeitada para o núcleo:** “preventivo sem caso” — quebra a arquitetura aprovada.

### 3.5 Onde documentar no documento

As regras de **secção 1** aplicam-se integralmente; esta secção apenas **especializa** o comportamento UX e de títulos para **bem-estar**.

---

## 4. Internação

### 4.1 Objetivo

Suportar internação com rastreio clínico, **sempre** contextualizada no episódio de cuidado (caso) e nascida de um atendimento de referência.

### 4.2 Conceitos

- Internação é entidade de internamento com evoluções e, quando aplicável, comanda própria.

### 4.3 Regras aprovadas

1. Toda internação pertence a um **caso clínico**.
2. Toda internação nasce **obrigatoriamente** de um **atendimento**; se não existir atendimento de admissão, o sistema **cria automaticamente** um atendimento de admissão (tipo adequado, ex.: emergência ou internação conforme enum alinhado).
3. **Alta**, **óbito** e **transferência** encerram a **internação** (status operacionais da internação).
4. Encerrar a internação **não** encerra automaticamente o **caso** clínico (o episódio pode continuar com retornos, receitas, etc.).

### 4.4 Fluxos

Admissão (atendimento) → internação ativa → eventos/evoluções → saída (alta/óbito/transferência) → caso pode permanecer `active`/`monitoring` até decisão clínica de `resolved`.

### 4.5 Exceções

- Transferência para outro estabelecimento: registrar destino mínimo (texto/contato) conforme prática da clínica.

### 4.6 Permissões

- Veterinário: decisões clínicas e alta.
- Enfermagem: **evolução** e **eventos** de internação (secção Permissões).
- Recepção: sem acesso a evolução diagnóstica detalhada.

### 4.7 Impactos financeiros

- Comanda de internação (quando existir) segue regras globais de comanda; internação não força fechamento de caso.

### 4.8 Impactos em estoque

- Materiais e medicamentos da internação: **podem** baixar estoque conforme matriz.

### 4.9 Impactos em timeline

- `hospitalization_started`, `hospitalization_discharged`, `hospitalization_death`, `hospitalization_transferred`.

### 4.10 Perguntas futuras

- Pacote de diárias; rateio multi-pet (raro).

---

## 5. Comanda

### 5.1 Objetivo

Registrar **o que será cobrado** do tutor de forma auditável, separando **prontuário** de **cobrança**, sem criar obrigações financeiras indevidas.

### 5.2 Conceitos

- Comanda **não** é prontuário; é instrumento de **venda/cobrança**.
- Pode existir **sem** atendimento; pode vincular-se a **pet/tutor** apenas.

### 5.3 Regras aprovadas

1. **Não nasce automaticamente** sem ação explícita do usuário **ou** configuração explícita da clínica (opt-in).
2. Pode existir **sem** atendimento.
3. Pode existir vinculada **apenas** a pet/tutor.
4. **Editável apenas enquanto aberta**; após **fechamento financeiro**, **proibidas alterações destrutivas** (ajustes via estorno/nota de crédito/nova comanda de correção, conforme política fiscal da clínica).
5. **Exame com resultado tardio:** não altera cobranças **já fechadas**; itens novos só entram em comanda **ainda aberta** ou em **nova** comanda, conforme processo interno da clínica.

### 5.4 Fluxos

Atendimento finalizado → (opcional) sugestão “Abrir comanda” → itens lançados → checkout → recebível/pagamento fora do escopo detalhado deste doc.

### 5.5 Exceções

- Desconto acima de limite: exigir permissão (definir na matriz de permissões futura).

### 5.6 Permissões

- **Financeiro:** comandas, recebíveis, fechamento.
- **Recepção:** pode **abrir** comanda conforme política; **não** vê conteúdo clínico completo.
- **Veterinário:** pode sugerir itens; política de **quem edita** linha em comanda aberta deve ser configurável (recomendação: recepção + financeiro; vet com permissão opcional).

### 5.7 Impactos financeiros

- Central para receita; congelamento de itens após fechamento evita litígio.

### 5.8 Impactos em estoque

- **Um único evento oficial de baixa** na venda de produto (regra aprovada); alinhar com o ponto de baixa no checkout ou na dispensação vinculada à comanda (definir unicidade na implementação).

### 5.9 Impactos em timeline

- Opcional futuro: `comanda_opened` / `comanda_closed` — **não** obrigatório na lista mínima clínica; avaliar para módulo financeiro.

### 5.10 Perguntas futuras

- Comanda **por caso** vs **por atendimento** vs **por internação**: hierarquia de visualização na UX.

---

## 6. Estoque

### 6.1 Objetivo

Manter inventário confiável sem **dupla baixa** nem furos entre clínica e caixa.

### 6.2 Conceitos

- **Baixa:** movimento de saída do estoque interno.
- **Prescrição para casa:** não implica saída automática do estoque da clínica.

### 6.3 Regras aprovadas (matriz resumida)

| Evento | Baixa de estoque |
|--------|------------------|
| Vacina aplicada **na clínica** (com vínculo a item/lote interno) | **Sim** |
| Vacina **externa** | **Não** |
| Medicamento **administrado na clínica** | **Pode** (config + vínculo a item/lote quando baixar) |
| Medicamento **apenas prescrito** para casa | **Não** |
| Materiais **cirúrgicos** consumidos | **Podem** |
| Materiais de **internação** | **Podem** |
| **Venda de produto** | **Um único** evento oficial de baixa (evitar duplicidade com clínica + comanda) |

### 6.4 Fluxos

Administração clínica com item de estoque → baixa no ato **ou** na dispensação vinculada à comanda — **uma** fonte de verdade por política de clínica (deve ser documentada na implementação).

### 6.5 Exceções

- Ajuste manual de inventário: sempre com permissão e motivo.

### 6.6 Permissões

- Estoque geralmente **recepção**/**admin**; veterinário **não** obrigatório para ajuste global.

### 6.7 Impactos financeiros

- Item faturado sem baixa (ou o inverso) gera divergência: a regra de **evento único** na venda mitiga.

### 6.8 Impactos em timeline

- Opcional: marco “dispensação” — normalmente **não** na timeline clínica canônica; manter em log de estoque.

### 6.9 Perguntas futuras

- Reagente de exame in house (baixa opcional por config).

---

## 7. Permissões (resumo aprovado)

### 7.1 Recepção

**Pode visualizar:** pet, tutor, agenda, status operacional, **motivo da visita** (queixa resumida para triagem).  
**Não pode visualizar:** diagnóstico, prescrições, exames, evolução clínica detalhada.

### 7.2 Veterinário

Responsável pelos **dados clínicos** (criar, editar, finalizar conforme política).

### 7.3 Financeiro

Responsável por **comandas**, **recebíveis** e **fechamento**.

### 7.4 Enfermagem

Pode registrar **evolução** e **eventos** de internação.

### 7.5 Demais perfis (admin, auxiliar, B&T)

- **Administrador:** bypass controlado das permissões da unidade.  
- **Auxiliar veterinário:** a definir por clínica (sugestão: sem diagnóstico final nem prescrição, pode auxiliar em sinais vitais).  
- **Banho e tosa:** sem acesso ao prontuário clínico salvo exceção multi-serviço documentada.  
- Detalhamento fino em `docs/architecture/PERMISSIONS_ROADMAP.md` ou equivalente, **sem contradizer** este documento.

---

## 8. Timeline clínica

### 8.1 Princípio

Apenas **marcos** com impacto clínico, legal ou operacional forte. **Não** registrar: autosaves, microedições, alterações sem impacto clínico.

### 8.2 Lista fechada recomendada (mínimo oficial)

1. `case_opened`  
2. `case_status_changed`  
3. `case_reopened`  
4. `encounter_created`  
5. `encounter_completed`  
6. `encounter_amended`  
7. `exam_requested`  
8. `exam_result_received`  
9. `prescription_issued`  
10. `vaccination_applied`  
11. `hospitalization_started`  
12. `hospitalization_discharged`  
13. `hospitalization_death`  
14. `hospitalization_transferred`  
15. `surgery_performed`  

### 8.3 Avaliação de eventos adicionais (opcionais)

| Evento | Incluir? | Notas |
|--------|----------|--------|
| `encounter_cancelled` | **Recomendado** | Marco operacional claro. |
| `exam_cancelled` | **Recomendado** | Evita buraco na narrativa. |
| `prescription_cancelled` / `prescription_document_issued` | **Opcional** | Segundo pode ser módulo receita. |
| `return_scheduled` | **Opcional** | Útil se agenda gerar retorno vinculado ao caso. |
| `attachment_added` | **Não recomendado** por padrão | Ruído; anexo já ligado a exame/prescrição. |
| `case_title_changed` | **Não** | Baixo valor; preferir auditoria genérica se necessário. |

**Decisão de produto:** incluir na versão mínima **`encounter_cancelled`** e **`exam_cancelled`**; manter os demais opcionais por release.

### 8.4 Impactos

- Performance: índices por `hub_case_id` e `pet_id`.  
- Internação: eventos hora a hora ficam em **tabela específica de internação**, não na timeline global, salvo marco resumido se a clínica solicitar (futuro).

---

## 9. Orçamento → tutor, pet, caso, atendimento

### 9.1 Regras aprovadas

Ao **aprovar** orçamento:

- **Cria ou associa** tutor.  
- **Cria ou associa** pet.  
- **Cria caso clínico.**  
- **Cria atendimento** (vinculado ao caso).  

**Não cria:** comanda, cobrança, recebível — surgem **depois** no fluxo financeiro explícito.

### 9.2 Fluxo ideal

Aprovação → dados mestres + caso + atendimento → agendamento/execução → abertura de comanda sob ação humana ou config → checkout.

### 9.3 Impactos

- Evita recebível “fantasma” e divergência com cancelamento de orçamento.

---

## 10. Conflitos entre decisões atuais e modelo técnico

| # | Conflito | Resolução recomendada |
|---|----------|------------------------|
| 1 | Tipos de atendimento (8 valores) vs enum técnico possivelmente menor | Alinhar **produto → schema**: expandir `encounter_type` **ou** usar `encounter_type` + `clinical_service_category` obrigatório para vacinação/internação/cirurgia/preventivo. |
| 2 | Tutor obrigatório vs walk-in urgente | Regra de produto: tutor obrigatório antes de **finalizar** atendimento **ou** antes de **comanda**; permitir rascunho clínico apenas com pet identificado se política da clínica permitir (documentar exceção). |
| 3 | Timeline “mínima” vs internação com muitos eventos | Eventos frequentes em **tabela de internação**; timeline só **marcos**. |
| 4 | `resolved_reason` opcional vs qualidade de relatório | UX que incentive preenchimento sem bloquear. |

---

## 11. Riscos de produto

1. **Lista de casos inflada** por muitos preventivos → mitigar com filtros e títulos inteligentes.  
2. **Fricção** na pergunta “qual caso?” em horário de pico → mitigar com UX rápida (últimos casos, busca, favorito).  
3. **Dupla baixa** se comanda e atendimento baixarem o mesmo item → mitigar com evento único de venda e regras explícitas na implementação.  
4. **LGPD:** recepção com motivo da visita ainda pode ser sensível — revisar textos e campos.  
5. **Responsabilidade técnica:** reabrir caso sem trilha forte → mitigar com motivo + permissão.

---

## 12. Inconsistências a corrigir antes ou durante a implementação

1. Enum de tipo de atendimento vs lista aprovada neste documento.  
2. Lista de eventos da timeline no código vs lista oficial **deste** documento (incluir `encounter_cancelled` e `exam_cancelled` se aprovado).  
3. Definição única do **momento** da baixa de estoque na venda (comanda vs dispensação).

---

## 13. Melhorias sugeridas antes da implementação

1. **Wireframe** do modal “Associar caso / Novo caso” em walk-in e agenda.  
2. **Catálogo** de `resolved_reason` configurável por clínica.  
3. **Painel “Financeiro do caso”** (lista de comandas e status) — UX, não obrigatório na v1.  
4. **Política escrita** de quem edita linha de comanda aberta.  
5. **ADR** fiscal: o que é “fechamento financeiro” no sistema (estado da comanda + recebível).

---

## 14. Impactos em UX (consolidado)

- Modal obrigatório de caso quando houver casos ativos.  
- Títulos sugeridos para preventivo e para orçamento convertido.  
- Internação: fluxo claro “admissão → internação” sem encerrar caso ao dar alta na internação.  
- Comanda: CTA explícito; sem surpresa de cobrança automática.  
- Recepção: telas **sem** blocos de diagnóstico/prescrição.

---

## 15. Impactos em banco e arquitetura (consolidado, sem prescrever DDL)

- Campos de motivo de reabertura e `resolved_reason`.  
- Metadados/tags de **preventivo** no caso.  
- Eventos de timeline com enum **fechado** e extensível por versão de API.  
- Comanda: estados que impeçam edição após fechamento; vínculos opcionais `hub_case_id` / `hub_encounter_id` para rastreio.  
- Estoque: vínculo movimento ↔ linha de comanda **ou** ↔ administração clínica, **nunca ambos** para o mesmo consumo.

---

## 16. Perguntas futuras (backlog de produto)

1. Mesclar casos duplicados.  
2. Permissões finas para **auxiliar** e **recepção** (abrir comanda sim/não).  
3. Nota fiscal eletrônica e estados da comanda.  
4. Multi-unidade: comanda sempre da unidade do atendimento?  
5. Telemedicina e consentimento.  
6. Integração laboratorial (fora do núcleo deste doc).  

---

## 17. Governança do documento

- Alterações a este arquivo exigem **revisão explícita** (PM + RT ou equivalente).  
- Versão: incrementar `Versão` no topo e registrar data no commit/PR de documentação.  
- Implementação: features **não** podem contradizer este documento sem antes **atualizar** este documento.
- **Plano de ondas (implementação):** [clinic-closeout-plan-revised.md](clinic-closeout-plan-revised.md) (ordem **A → B1 → B2 → C → D → E → F**; **G** separado).  
- **Migrations da Clínica (ordem e checklist):** [README_CLINICA_MIGRATIONS.md](README_CLINICA_MIGRATIONS.md).

---

*Fim do documento oficial de regras de negócio — Clínica PetMi Hub.*
