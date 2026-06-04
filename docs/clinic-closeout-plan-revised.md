# Plano revisado — Fechamento de gaps da Clínica (PetMi Hub)

**Versão:** 2.1 (Onda B dividida em **B1** + **B2** por risco)  
**Fonte de verdade de produto:** [docs/clinical-business-rules.md](clinical-business-rules.md)  
**Escopo deste documento:** planejamento das ondas **B1–G**; a **Onda A** inclui entregável de documentação em repositório ([README_CLINICA_MIGRATIONS.md](README_CLINICA_MIGRATIONS.md)). Migrations **novas** além das já versionadas continuam fora deste plano até decisão explícita.  
**Alteração em relação à v2.0:** **B** foi fatiada em **B1** (página de caso completa, sem exames estruturados na UI) e **B2** (exames `hub_clinical_exams` + workspace + remoção da tela órfã). **Ordem oficial:** **A → B1 → B2 → C → D → E → F**; **G** separado.

---

## Visão geral das ondas

| Onda | Nome | Prioridade |
|------|------|------------|
| **A** | Base de dados e runbook | Máxima |
| **B1** | Página de Caso completa (sem UI de exames estruturados) | Alta |
| **B2** | Exames estruturados na UI (`hub_clinical_exams`) | Alta |
| **C** | Walk-in sem tutor / checkout | Alta (bloqueio operacional) |
| **D** | Prescrição / receita | Média |
| **E** | Estoque + comanda | Média |
| **F** | Audit trail amigável | Após fluxos principais |
| **G** | Fase 9 (epics separados) | Posterior, sem misturar com gaps estruturais |

---

# Onda A — Base de dados e runbook

## 1. Objetivo

Garantir que **migrations**, **schema** e **ambiente** (local/staging/produção futura) estejam alinhados ao código atual da Clínica, eliminando erros do tipo **coluna inexistente** e encounters **órfãos** antes de qualquer evolução de produto.

## 2. Escopo

- README de migrations da Clínica: [docs/README_CLINICA_MIGRATIONS.md](README_CLINICA_MIGRATIONS.md) (ordem dos SQLs, checklist, queries, troubleshooting).
- Ordem recomendada de execução dos SQLs relacionados a: casos, encounters, timeline, document versions, exames, prescrições/documentos, vacinas, internação, cirurgias, comandas (conforme já existentes no repositório).
- Checklist de verificação pós-aplicação: presença de `hub_case_id` em `hub_encounters`, contagem de órfãos = 0 antes de `NOT NULL` (se aplicável ao ambiente), reload de schema PostgREST quando aplicável.
- Validação manual: **Clínica carrega** (atendimentos, prontuário, caso) **sem erro de coluna**.

## 3. Fora de escopo

- Alteração de regras de negócio (já em `clinical-business-rules.md`).
- Nova feature de UI.
- Automação CI de migrations (pode ser sugerida como melhoria futura, não obrigatória nesta onda).

## 4. Arquivos afetados

- **Documentação (repositório):** [docs/README_CLINICA_MIGRATIONS.md](README_CLINICA_MIGRATIONS.md) — ordem dos SQLs, checklist, queries de validação, troubleshooting.
- **Leitura apenas (referência):** arquivos `.sql` em `backend/database_migrations/petimi_hub/` listados nesse README.

## 5. APIs afetadas

- Nenhuma alteração de contrato nesta onda — apenas **garantir** que o ambiente suporte as rotas já existentes (`/clinical/cases`, `/encounters`, `/clinical/exams`, etc.).

## 6. Migrations afetadas (referência — aplicar, não reescrever)

Exemplos típicos já presentes no repositório (lista não exaustiva — o README oficial deve ser a fonte enumerada):

- `create_hub_clinical_cases.sql`
- `alter_hub_encounters_add_case.sql`
- `backfill_hub_clinical_cases.sql`
- `alter_hub_encounters_case_not_null.sql` (somente após validação de órfãos)
- `create_hub_clinical_timeline_events.sql`
- `create_hub_clinical_document_versions.sql`
- `create_hub_clinical_exams.sql`, `alter_hub_clinical_attachments_add_exam.sql`
- `create_hub_prescription_documents.sql` (+ alter em `hub_prescriptions` se no mesmo arquivo)
- `alter_hub_vaccination_records_fase6.sql`
- `create_hub_hospitalization_events.sql`, `alter_hub_hospitalizations_fase7.sql`
- `alter_hub_surgeries_fase8.sql`
- `alter_hub_comandas_fase9.sql`

## 7. Riscos

- Aplicar `NOT NULL` em `hub_case_id` com órfãos remanescentes → **quebra** do deploy.
- Ordem errada de FKs (caso antes de encounter, etc.).
- Ambiente apontando para **outro** projeto Supabase sem as migrations.

## 8. Critérios de aceite

- README publicado com **ordem** e **checklist**.
- Query de verificação documentada: `hub_encounters` com `hub_case_id` preenchido para todos os registros ativos exigidos pela política do ambiente.
- Smoke test: abrir **Atendimentos** e **Caso** sem erro de schema.

## 9. Ordem de implementação recomendada (dentro da Onda A)

1. Inventariar todos os `.sql` da Clínica já no repositório.  
2. Definir ordem linear com dependências (FKs).  
3. Escrever README + checklist.  
4. Aplicar em staging/local e validar.  
5. Só então iniciar **Onda B1**.

## 10. Testes manuais sugeridos

- Abrir `/hub/clinica/atendimentos` e lista do day-board.
- Abrir um atendimento existente no workspace.
- Abrir prontuário e um caso (`/hub/clinica/casos/:id`).
- Confirmar no SQL editor (ou Metabase) colunas-chave existentes.

---

# Onda B1 — Página de Caso completa

## 1. Objetivo

Entregar a **visão 360° do caso clínico** no Hub (resumo + entidades vinculadas), **sem** depender da UI de exames estruturados (essa entra na **B2**), reduzindo risco de escopo misturado.

## 2. Escopo

- **Resumo do caso** (título, status, datas, pet, tutor snapshot se aplicável).
- **Atendimentos** do caso (`hub_case_id`).
- **Prescrições** filtradas por caso (ou por `hub_case_id` quando preenchido).
- **Vacinas** vinculadas ao caso quando a API/modelo permitir.
- **Internações** com `hub_case_id`.
- **Cirurgias** com `hub_case_id`.
- **Anexos** do pet/caso (lista útil; link via `storage_path` / URL assinada conforme padrão do Hub).
- **Financeiro do caso** quando houver dado (ex.: comandas com `hub_case_id` após migration da Onda A — leitura somente na v1).

## 3. Fora de escopo (B1)

- CRUD de **exames estruturados** na UI e fluxo “solicitar no atendimento” (**B2**).
- Remoção de `HubClinicExamsPage` e correção `file_url` vs `storage_path` no fluxo de exames (**B2** — anexos na página de caso podem usar o padrão correto se já existir componente reutilizável).

## 4. Arquivos afetados (previstos)

- [packages/hub-ui/src/pages/clinica/HubClinicCasePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicCasePage.tsx)
- [packages/hub-ui/src/api/hubClinicalApi.ts](packages/hub-ui/src/api/hubClinicalApi.ts) (chamadas agregadas / filtros)
- Backend: estender listagens com query `hub_case_id` onde faltar — ex.: [hubClinicalModulesController.ts](backend/src/modules/hub/hubClinicalModulesController.ts), rotas em [routes/index.ts](backend/src/modules/hub/routes/index.ts)

## 5. APIs afetadas

- `GET /clinical/cases/:id` (enriquecimento opcional) ou múltiplos `GET` com `hub_case_id` em hospitalizations, surgeries, prescriptions, vaccinations, comandas.

## 6. Migrations afetadas

- Nenhuma nova na B1 se a Onda A já aplicou `hub_case_id` em entidades filhas e comandas.

## 7. Riscos

- N+1 de requests na página do caso → considerar endpoint agregado ou carregamento lazy por aba.

## 8. Critérios de aceite

- Página do caso lista **todas** as seções do escopo com dados reais quando existirem.
- Navegação clara entre caso e atendimento.
- Financeiro: mensagem “nenhuma comanda vinculada” quando vazio, sem erro.

## 9. Ordem de implementação recomendada (dentro da B1)

1. Backend: filtros `hub_case_id` faltantes.  
2. UI: seções/abas na ordem de prioridade clínica.  
3. Anexos e comandas (leitura).  
4. QA manual.

## 10. Testes manuais sugeridos

- Caso com internação + cirurgia + 2 atendimentos: tudo visível.  
- Caso sem comanda: painel financeiro vazio ou informativo.

---

# Onda B2 — Exames estruturados na UI

## 1. Objetivo

Fechar **pet → caso → atendimento → exame solicitado → resultado (e anexo)** com **`hub_clinical_exams`** como fonte oficial na UI, alinhado a [clinical-business-rules.md](clinical-business-rules.md).

## 2. Escopo

- Usar **`hub_clinical_exams`** como fonte oficial (listas, detalhe, estados).
- **Solicitar exame no atendimento** ([HubClinicalWorkspacePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx)).
- **Anexar resultado depois** (vínculo `hub_exam_id` em anexos quando aplicável).
- **Visualizar exame no caso** (seção exames na página do caso).
- **Corrigir ou remover** [HubClinicExamsPage.tsx](packages/hub-ui/src/pages/clinica/HubClinicExamsPage.tsx) órfã; alinhar [HubClinicRoutes.tsx](packages/hub-ui/src/pages/clinica/HubClinicRoutes.tsx).
- Corrigir **`file_url` vs `storage_path`** em listagens de anexo/exame legado.

## 3. Fora de escopo (B2)

- Integração laboratorial externa (**G**).
- Kanban pesado de exames (opcional futuro).

## 4. Arquivos afetados (previstos)

- [packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx)
- [packages/hub-ui/src/pages/clinica/HubClinicCasePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicCasePage.tsx) (aba/seção exames)
- [packages/hub-ui/src/pages/clinica/HubClinicRoutes.tsx](packages/hub-ui/src/pages/clinica/HubClinicRoutes.tsx)
- [packages/hub-ui/src/pages/clinica/HubClinicRecordsPage.tsx](packages/hub-ui/src/pages/clinica/HubClinicRecordsPage.tsx) (tab exames vs caso, se redundante)
- [packages/hub-ui/src/pages/clinica/HubClinicExamsPage.tsx](packages/hub-ui/src/pages/clinica/HubClinicExamsPage.tsx)
- [packages/hub-ui/src/api/hubClinicalApi.ts](packages/hub-ui/src/api/hubClinicalApi.ts)
- [backend/src/modules/hub/hubClinicalExamsController.ts](backend/src/modules/hub/hubClinicalExamsController.ts)
- [backend/src/modules/hub/hubClinicalModulesController.ts](backend/src/modules/hub/hubClinicalModulesController.ts) (anexos + exame)

## 5. APIs afetadas

- `GET/POST/PATCH/DELETE /clinical/exams` (extensões de query se necessário).

## 6. Migrations afetadas

- Nenhuma nova se a Onda A já aplicou `create_hub_clinical_exams.sql` e `alter_hub_clinical_attachments_add_exam.sql`.

## 7. Riscos

- Duplicidade de UX entre “Exames” no prontuário e no caso — uma só deve ser canônica ou cruzar links explicitamente.

## 8. Critérios de aceite

- Solicitar exame no workspace → aparece no caso com `hub_case_id` correto.  
- Registrar resultado depois → timeline (`exam_result_received`) conforme regras.  
- Não existe tela órfã com `file_url` incorreto.  
- Exame **não** tratado apenas como anexo sem registro em `hub_clinical_exams` no fluxo feliz.

## 9. Ordem de implementação recomendada (dentro da B2)

1. Workspace: seção exames + create/patch.  
2. Caso: lista/detalhe de exames.  
3. Anexo com `hub_exam_id`.  
4. Remover/redirecionar `HubClinicExamsPage`.  
5. QA + timeline.

## 10. Testes manuais sugeridos

- Dois casos ativos no mesmo pet: exame no caso certo.  
- Resultado dias depois: estado e anexo corretos.

---

# Onda C — Walk-in sem tutor / checkout

## 1. Objetivo

Eliminar **`NO_GUARDIAN`** na comanda e alinhar-se às regras de [clinical-business-rules.md](clinical-business-rules.md) (tutor antes de fechamento financeiro; urgência com rascunho).

## 2. Escopo

- Atendimento pode **iniciar** sem tutor apenas em cenário de **urgência/rascunho** (política explícita na UI).
- **Finalizar** atendimento ou **abrir comanda/checkout** exige tutor responsável.
- Se o pet tiver **tutor principal**, pré-preencher / resolver automaticamente o `guardian_id` do encounter.
- Se não houver tutor, **bloquear** finalização e abertura de comanda com mensagem orientando cadastro ou vínculo.

## 3. Fora de escopo

- CRM completo de tutores.
- Validação documental (RG/CPF) além do mínimo já existente.

## 4. Arquivos afetados (previstos)

- [backend/src/modules/hub/hubEncountersController.ts](backend/src/modules/hub/hubEncountersController.ts) (`create`, `complete`, possivelmente `patch`)
- [backend/src/modules/hub/hubComandasController.ts](backend/src/modules/hub/hubComandasController.ts) (`buildComandaItemsFromEncounter` / `postHubComandaOpen` — validação defensiva)
- [packages/hub-ui/src/pages/clinica/ClinicWalkInPanel.tsx](packages/hub-ui/src/pages/clinica/ClinicWalkInPanel.tsx)
- [packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx) (finalizar + checkout)
- [packages/hub-ui/src/pages/clinica/HubClinicEncountersPage.tsx](packages/hub-ui/src/pages/clinica/HubClinicEncountersPage.tsx)

## 5. APIs afetadas

- `POST /encounters` (ou equivalente de criação)
- `PATCH` / complete de encounters
- `POST /comandas/open` com `origin_type=encounter`

## 6. Migrations afetadas

- Nenhuma **obrigatória**, salvo se faltar coluna de “rascunho/urgência” — preferir **flags em encounter** já existentes (`status`) + regras de validação.

## 7. Riscos

- Bloqueio excessivo em plantão → UX ruim; mitigar com fluxo rápido “cadastrar tutor mínimo em 30s”.

## 8. Critérios de aceite

- Não é possível **finalizar** sem tutor quando a regra se aplica.
- Não é possível **abrir comanda** a partir do encounter sem tutor.
- Pet com tutor principal: encounter ganha `guardian_id` sem fricção desnecessária.

## 9. Ordem de implementação recomendada

1. Regra no backend (`complete` + comanda).  
2. UI walk-in + workspace (avisos e bloqueios).  
3. Testes com pet sem tutor / com tutor.

## 10. Testes manuais sugeridos

- Walk-in urgência sem tutor → salvar rascunho → tentar finalizar → bloqueado.  
- Associar tutor → finalizar → abrir comanda → sucesso.  
- Pet com tutor principal → fluxo sem passo extra.

---

# Onda D — Prescrição / receita

## 1. Objetivo

**Uma prescrição com múltiplos itens**; documento (receita/PDF) gerado a partir dela; **histórico de emissão** visível; PDF na UI principal; assinatura digital permanece **placeholder** (Onda G).

## 2. Escopo

- Modelo de dados e API: uma prescrição, N itens; emissão versionada em `hub_prescription_documents`.
- UI: edição de itens na mesma prescrição; botão emitir/reemitir; lista de versões.
- Alinhamento com [clinical-business-rules.md](clinical-business-rules.md) (prescrição vs receita).

## 3. Fora de escopo

- Assinatura digital ICP-Brasil (Onda G).
- Layout legal completo CRMV/UF (decisão futura; pode manter PDF atual melhorado incrementalmente).

## 4. Arquivos afetados (previstos)

- [backend/src/modules/hub/hubClinicalModulesController.ts](backend/src/modules/hub/hubClinicalModulesController.ts)
- [backend/src/modules/hub/hubPrescriptionPdf.ts](backend/src/modules/hub/hubPrescriptionPdf.ts) (se geração por prescrição inteira)
- [backend/src/modules/hub/routes/index.ts](backend/src/modules/hub/routes/index.ts)
- [packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx)
- [packages/hub-ui/src/api/hubClinicalApi.ts](packages/hub-ui/src/api/hubClinicalApi.ts)

## 5. APIs afetadas

- Criação/atualização de prescrição e itens
- `POST` emissão de documento de receita (já existente parcialmente — consolidar contrato)
- `GET` listagem de documentos por `prescription_id`

## 6. Migrations afetadas

- Já cobertas por `create_hub_prescription_documents.sql` + alter em `hub_prescriptions` (Onda A deve aplicá-las). Novas migrations só se faltar coluna em `hub_prescription_items`.

## 7. Riscos

- Migração de dados legados “1 prescrição = 1 item” → script de consolidação (avaliar se necessário em ambiente com dados reais futuros).

## 8. Critérios de aceite

- Fluxo feliz: N linhas, uma emissão, PDF acessível, segunda emissão incrementa versão.
- Estoque: itens `home_use` não disparam baixa automática (regra já aprovada — garantir que não quebre na refatoração).

## 9. Ordem de implementação recomendada

1. Backend: invariante “uma prescrição ativa por contexto” (definir contexto: encounter).  
2. UI lista de itens.  
3. Emissão + histórico.  
4. PDF na UI.

## 10. Testes manuais sugeridos

- Adicionar 3 itens → emitir → PDF com 3 itens.  
- Reemitir após ajuste de dose → versão 2 no histórico.

## 11. Estado da implementação (hub)

- **Backend:** `POST /clinical/prescriptions` anexa itens à prescrição existente (`draft`/`active`) do mesmo `hub_encounter_id` + `clinic_id` + `pet_id`; `PATCH /clinical/prescriptions/:id` altera notas e/ou substitui a lista de itens; `POST .../prescriptions/:id/documents` confere se a prescrição pertence ao `clinic_id`; `GET .../prescriptions` aceita filtro opcional `hub_encounter_id`.
- **hub-ui:** API cliente com `patchPrescription`, `listPrescriptionDocuments`, `issuePrescriptionDocument`; no workspace clínico, bloco único da prescrição do atendimento (vários itens, observações, remover item, emitir/reemitir, histórico de versões, abrir PDF).

---

# Onda E — Estoque + comanda

## 1. Objetivo

Aplicar [clinical-business-rules.md](clinical-business-rules.md) na prática: **sem dupla baixa**; comanda **não recalculável** de forma destrutiva após fechamento; **exame tardio** não altera cobrança fechada.

## 2. Escopo

- Matriz de baixa: vacina in-clinic, externa, medicamento admin/prescrito, materiais, **um evento oficial** de baixa na venda de produto.
- Comanda: congelamento lógico pós-fechamento; adição de linhas só em comanda **aberta** ou nova comanda; resultado de exame depois não altera linhas já faturadas/fechadas.

## 3. Fora de escopo

- Motor fiscal completo (NF-e).
- Onda G (notificações, imutabilidade “avançada” com integrações externas).

## 4. Arquivos afetados (previstos)

- [backend/src/modules/hub/hubComandasController.ts](backend/src/modules/hub/hubComandasController.ts)
- [backend/src/modules/hub/hubClinicalModulesController.ts](backend/src/modules/hub/hubClinicalModulesController.ts) (vacina, prescrição, estoque)
- Possivelmente serviços de estoque compartilhados (grep `hub_stock_movements`)

## 5. APIs afetadas

- `postHubComandaOpen`, checkout, patch de itens (se existir)
- Endpoints clínicos que criam `hub_stock_movements`

## 6. Migrations afetadas

- `alter_hub_comandas_fase9.sql` (já prevê vínculo caso/encounter — aplicar na Onda A)
- Tabelas de estoque já existentes — sem migration nova se regra for só de código

## 7. Riscos

- Clínicas que baixam no ato **e** na comanda — exigir decisão única documentada na implementação.

## 8. Critérios de aceite

- Mesmo item não gera duas saídas de estoque para o mesmo consumo.
- Comanda fechada: tentativa de alterar linha de exame → negada ou gera fluxo de ajuste separado.
- Exame concluído após checkout: não altera recebível já gerado.

## 9. Ordem de implementação recomendada

1. Mapear todos os pontos de baixa hoje.  
2. Definir “fonte da verdade” por tipo de consumo.  
3. Implementar guardas na comanda.  
4. Testes de regressão financeira manual.

## 10. Testes manuais sugeridos

- Vacina com lote → baixa única → comanda com mesmo item (cenário de risco).  
- Fechar comanda → resultado de exame depois → saldo e PDF inalterados.

---

# Onda F — Audit trail amigável

## 1. Objetivo

Melhorar a **visualização** de versões do prontuário (atendimento): diff campo a campo, valor anterior/novo, usuário, data, motivo; fallback JSON/texto se diff automático não estiver pronto.

## 2. Escopo

- API: `GET /encounters/:id/versions` deve expor dados suficientes (hoje o documento pode estar omitido na resposta — **corrigir** para leitura autorizada).
- UI: visualização estruturada + fallback.

## 3. Fora de escopo

- Versionar todas as entidades do Hub.
- Diff de anexos binários.

## 4. Arquivos afetados (previstos)

- [backend/src/modules/hub/hubEncountersController.ts](backend/src/modules/hub/hubEncountersController.ts) (`getHubEncounterVersions`, opcional cálculo server-side de diff)
- [packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx)

## 5. APIs afetadas

- `GET /encounters/:id/versions`
- Opcional: `GET /encounters/:id/versions/:versionNo`

## 6. Migrations afetadas

- Nenhuma (usa `hub_clinical_document_versions` já criada na Onda A).

## 7. Riscos

- Payload grande → paginar versões ou endpoint por versão.
- JSON profundo (anamnese) → diff ruidoso; considerar **paths ignorados** ou resumo por seção.

## 8. Critérios de aceite

- Após `amend`, usuário vê **o que mudou** de forma mais clara que lista simples de versões.
- Permissão: apenas perfis com `hub.clinic.read` (e escrita onde aplicável).

## 9. Ordem de implementação recomendada

1. Incluir `document` (ou diff) na API com segurança.  
2. UI diff básico.  
3. Refinar diff por seções clínicas.

## 10. Testes manuais sugeridos

- Duas emendas seguidas → duas entradas com diff coerente.  
- Comparar com motivo vazio vs preenchido.

---

# Onda G — Fase 9 (epics separados)

## 1. Objetivo

Entregas que **não** devem ser misturadas ao fechamento estrutural das ondas A–F.

## 2. Escopo (lista de epics)

- Assinatura digital de receita  
- Integração laboratorial (pedido/resultado)  
- Lembretes automáticos  
- Orçamento aprovado → caso/atendimento (já parcialmente nas regras — automação completa aqui)  
- Imutabilidade avançada da comanda + integrações fiscais  
- Notificações (push/email/app)

## 3. Fora de escopo das ondas A–F

Tudo acima permanece **fora** até encerramento das ondas **A–F**, salvo dependência técnica mínima já prevista nas migrations da Onda A.

## 4–10. Arquivos, APIs, migrations, riscos, aceite, ordem, testes

- **A definir por epic** em documentos filhos (um por epic) após priorização de negócio.
- **Risco principal:** escopo creep misturado com Clínica “núcleo”.

---

# Ordem global de implementação (resumo)

**A → B1 → B2 → C → D → E → F**; **G** em paralelo apenas com time separado e **sem** bloquear A–F.

Dependências cruzadas:

- **B1** e **B2** dependem de **A** (schema: casos, encounters, exames, anexos, comandas vinculadas).  
- **B2** recomenda-se **após B1** (página do caso pronta para receber a seção de exames estruturados); paralelizar B2 antes só se aceitar retrabalho de layout na página do caso.  
- **C** recomenda-se **após B2** (fluxo caso + exame + tutor/comanda coerente).  
- **D** e **E** podem paralelizar após **C** se equipe maior; caso contrário **D** antes de **E** para não refatorar comanda duas vezes sobre prescrição.

---

# Rastreabilidade com o documento oficial

| Tema nas regras | Onda principal |
|-----------------|----------------|
| Caso, não auto-associar | B1 (UX caso), C |
| Exames como entidade | **B2** |
| Internações/cirurgias no caso | **B1** |
| Comanda não automática, exame tardio | E |
| Estoque | E |
| Tutor antes financeiro | C |
| Timeline marcos | B2 (exames), F (amend), E (comanda opcional futuro) |
| Prescrição vs documento | D |

---

# Nota sobre o plano anterior (`fechar_gaps_clínica`)

A versão anterior priorizava **Audit Trail (F)** antes de **Caso + Exames**. A **v2.0** priorizou Caso+Exames antes do audit; a **v2.1** fatia **B** em **B1** + **B2** para reduzir risco. O arquivo [README_CLINICA_MIGRATIONS.md](README_CLINICA_MIGRATIONS.md) cobre a **Onda A** no repositório.

---

*Plano de ondas para implementação. Onda A: README de migrations versionado em `docs/`.*
