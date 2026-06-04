# Plano revisado — Fechamento de gaps da Clínica (PetMi Hub)

**Versão:** 2.0 (reordenação por impacto operacional)  
**Fonte de verdade de produto:** [docs/clinical-business-rules.md](clinical-business-rules.md)  
**Escopo deste documento:** planejamento apenas — **não** inclui implementação, migrations novas nem tickets.  
**Alteração em relação à v1 do plano de gaps:** **Onda B** passa a ser **Caso + Exames na UI** (antes: Audit Trail amigável). **Audit Trail** desce para **Onda F**.

---

## Visão geral das ondas

| Onda | Nome | Prioridade |
|------|------|------------|
| **A** | Base de dados e runbook | Máxima |
| **B** | Caso clínico completo + Exames na UI | Alta (fluxo clínico principal) |
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

- README de migrations da Clínica (pasta `backend/database_migrations/petimi_hub/` ou subpasta documentada).
- Ordem recomendada de execução dos SQLs relacionados a: casos, encounters, timeline, document versions, exames, prescrições/documentos, vacinas, internação, cirurgias, comandas (conforme já existentes no repositório).
- Checklist de verificação pós-aplicação: presença de `hub_case_id` em `hub_encounters`, contagem de órfãos = 0 antes de `NOT NULL` (se aplicável ao ambiente), reload de schema PostgREST quando aplicável.
- Validação manual: **Clínica carrega** (atendimentos, prontuário, caso) **sem erro de coluna**.

## 3. Fora de escopo

- Alteração de regras de negócio (já em `clinical-business-rules.md`).
- Nova feature de UI.
- Automação CI de migrations (pode ser sugerida como melhoria futura, não obrigatória nesta onda).

## 4. Arquivos afetados

- **Novo (documentação):** `docs/README_CLINICA_MIGRATIONS.md` (ou nome equivalente acordado pelo time), referenciando arquivos `.sql` existentes.
- **Leitura apenas (referência):** todos os `backend/database_migrations/petimi_hub/*.sql` listados no README na ordem correta.

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
5. Só então iniciar Onda B.

## 10. Testes manuais sugeridos

- Abrir `/hub/clinica/atendimentos` e lista do day-board.
- Abrir um atendimento existente no workspace.
- Abrir prontuário e um caso (`/hub/clinica/casos/:id`).
- Confirmar no SQL editor (ou Metabase) colunas-chave existentes.

---

# Onda B — Caso clínico completo + Exames na UI

## 1. Objetivo

Fechar o **fluxo clínico principal** alinhado ao documento oficial: **pet → caso → atendimento → exame solicitado → resultado (e anexo) → visibilidade no caso**, sem tratar exame apenas como anexo genérico.

## 2. Escopo

- **Página de caso** (`HubClinicCasePage`): exibir resumo + abas/seções para: atendimentos, **exames** (`hub_clinical_exams`), prescrições, vacinas, **internações**, **cirurgias**, **anexos**, e **financeiro do caso** quando já houver dados (ex.: comandas com `hub_case_id` ou listagem por `origin_id` + vínculo ao caso — usar o que o backend expuser após alinhamento mínimo).
- **Exames:** `hub_clinical_exams` como fonte oficial na UI; solicitar exame **no atendimento** (workspace); anexar resultado **depois**; visualizar no **caso** e no **workspace**.
- **Consolidação:** remover ou fundir `HubClinicExamsPage.tsx` órfã; corrigir **`file_url` vs `storage_path`** em qualquer listagem de anexos que ainda use o campo errado.
- **Rotas:** garantir que não exista rota morta apontando para página inconsistente; alinhar com [docs/clinical-business-rules.md](clinical-business-rules.md) (timeline de exame solicitado / resultado).

## 3. Fora de escopo

- Integração com laboratório externo (Onda G).
- Kanban complexo de exames por status (pode ser fase 2 dentro da onda se sobrar capacidade).
- Alteração profunda do modelo de `hub_clinical_attachments` além do necessário para vincular resultado ao exame.

## 4. Arquivos afetados (previstos)

**Frontend**

- [packages/hub-ui/src/pages/clinica/HubClinicCasePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicCasePage.tsx)
- [packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx](packages/hub-ui/src/pages/clinica/HubClinicalWorkspacePage.tsx)
- [packages/hub-ui/src/pages/clinica/HubClinicRoutes.tsx](packages/hub-ui/src/pages/clinica/HubClinicRoutes.tsx)
- [packages/hub-ui/src/pages/clinica/HubClinicRecordsPage.tsx](packages/hub-ui/src/pages/clinica/HubClinicRecordsPage.tsx) (tab exames vs caso, se redundante)
- [packages/hub-ui/src/pages/clinica/HubClinicExamsPage.tsx](packages/hub-ui/src/pages/clinica/HubClinicExamsPage.tsx) (remover, redirecionar ou reescrever)
- [packages/hub-ui/src/api/hubClinicalApi.ts](packages/hub-ui/src/api/hubClinicalApi.ts) (`hubClinicalExamsApi`, tipos, URLs assinadas se necessário)

**Backend (se faltar filtro ou enriquecimento)**

- [backend/src/modules/hub/hubClinicalExamsController.ts](backend/src/modules/hub/hubClinicalExamsController.ts)
- [backend/src/modules/hub/hubClinicalCasesController.ts](backend/src/modules/hub/hubClinicalCasesController.ts) (opcional: endpoint agregado “detalhe do caso” para reduzir N+1)
- [backend/src/modules/hub/hubClinicalModulesController.ts](backend/src/modules/hub/hubClinicalModulesController.ts) (anexos + `hub_exam_id` se upload de resultado)
- [backend/src/modules/hub/routes/index.ts](backend/src/modules/hub/routes/index.ts) (somente se novas rotas)

## 5. APIs afetadas

- `GET/POST/PATCH/DELETE /clinical/exams` (já existentes — possível extensão de query `hub_case_id`).
- `GET /clinical/cases/:id` e/ou `GET /clinical/cases` — possíveis includes ou endpoint agregado.
- `GET /clinical/hospitalizations` e `GET /clinical/surgeries` com filtro por `hub_case_id` (se ainda não suportado, **estender**).
- Listagem de comandas por caso (se não existir: `GET` comandas `hub_case_id` ou uso de `getComandaByOrigin` + mapeamento — **definir na implementação** sem contradizer regras de comanda).

## 6. Migrations afetadas

- **Nenhuma migration nova obrigatória** se `hub_clinical_exams`, `hub_exam_id` em anexos e FKs de caso já estiverem aplicadas (Onda A).
- Se o backend precisar de índice ou coluna faltante descoberta na Onda B, tratar como **sub-onda B.1** com migration dedicada (fora do escopo “só replanejamento” até aprovação).

## 7. Riscos

- N+1 de requests na página do caso → lentidão.
- Duplicidade visual entre “Exames” no prontuário e “Exames” no caso — mitigar com navegação clara.
- URL de anexo: padrão de signed URL deve ser **único** (alinhado a `storage_path`).

## 8. Critérios de aceite

- No **workspace**, veterinário solicita exame vinculado ao **atendimento** e ao **caso** (quando aplicável).
- Após resultado, anexo pode ser ligado ao **exame**; timeline registra marcos conforme [clinical-business-rules.md](clinical-business-rules.md).
- Na **página do caso**, lista de exames estruturados + link para detalhe/resultado.
- Não existe tela órfã usando `file_url` incorreto para anexos clínicos.
- Internações e cirurgias com `hub_case_id` aparecem no caso quando a API permitir filtro.

## 9. Ordem de implementação recomendada (dentro da Onda B)

1. API: garantir listagens por `hub_case_id` (exames, internações, cirurgias).  
2. `HubClinicCasePage`: novas seções/abas + dados reais.  
3. `HubClinicalWorkspacePage`: seção “Exames” com CRUD mínimo.  
4. Anexos: fluxo “resultado no exame” com `hub_exam_id`.  
5. Remover/consolidar `HubClinicExamsPage` + ajustar rotas.  
6. “Financeiro do caso”: leitura somente do que já existir (`hub_comandas.hub_case_id` se migration aplicada).

## 10. Testes manuais sugeridos

- Criar caso → atendimento → solicitar exame → ver no caso.  
- Registrar resultado (texto e/ou anexo) dias depois → ver no caso e timeline.  
- Pet com dois casos ativos: exame no caso correto.  
- Abrir anexo pelo link (não 404 / não campo vazio).

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

Tudo acima permanece **fora** até encerramento das ondas anteriores, salvo dependência técnica mínima já prevista nas migrations da Onda A.

## 4–10. Arquivos, APIs, migrations, riscos, aceite, ordem, testes

- **A definir por epic** em documentos filhos (um por epic) após priorização de negócio.
- **Risco principal:** escopo creep misturado com Clínica “núcleo”.

---

# Ordem global de implementação (resumo)

**A → B → C → D → E → F**; **G** em paralelo apenas com time separado e **sem** bloquear A–F.

Dependências cruzadas:

- **B** depende de **A** (schema de exames, caso, anexos).  
- **C** pode ser paralelizado a **parte** de B (UI tutor) mas recomenda-se **após B mínimo** se finalização for testada junto do fluxo caso+exame.  
- **D** e **E** podem paralelizar após **C** se equipe maior; caso contrário **D** antes de **E** para não refatorar comanda duas vezes sobre prescrição.

---

# Rastreabilidade com o documento oficial

| Tema nas regras | Onda principal |
|-----------------|----------------|
| Caso, não auto-associar | B (UX escolha), C |
| Exames como entidade | B |
| Comanda não automática, exame tardio | E |
| Estoque | E |
| Tutor antes financeiro | C |
| Timeline marcos | B (exames), F (amend), E (comanda opcional futuro) |
| Prescrição vs documento | D |

---

# Nota sobre o plano anterior (`fechar_gaps_clínica`)

A versão anterior priorizava **Audit Trail (F)** antes de **Caso + Exames (B)**. Este documento **substitui essa prioridade** por impacto operacional e aderência a [docs/clinical-business-rules.md](clinical-business-rules.md). O arquivo antigo de plano no Cursor pode ser arquivado ou atualizado com um link para **este** documento como referência oficial de **ordem de ondas**.

---

*Documento de replanejamento apenas — sem implementação.*
