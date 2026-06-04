# Migrations da Clínica (PetMi Hub)

**Objetivo:** aplicar o schema da reformulação **Pet → Prontuário → casos clínicos → eventos** na ordem correta e validar o ambiente antes de desenvolver **B1/B2** em diante.

**Onde estão os arquivos:** `backend/database_migrations/petimi_hub/`

**Ordem oficial de execução** (dependências de FK e backfill):

| # | Arquivo | Descrição breve |
|---|---------|-----------------|
| 1 | `create_hub_clinical_cases.sql` | Tabela `hub_clinical_cases`. |
| 2 | `alter_hub_encounters_add_case.sql` | Colunas `hub_case_id` (nullable) e `encounter_type` em `hub_encounters`. |
| 3 | `backfill_hub_clinical_cases.sql` | Um caso por encounter existente; preenche `hub_case_id`. **Rodar uma vez** por ambiente. |
| 4 | *(validação)* | Ver queries na secção **Checklist** — órfãos = 0 antes do passo 5. |
| 5 | `alter_hub_encounters_case_not_null.sql` | Torna `hub_case_id` **NOT NULL**. **Só após** o passo 4 OK. |
| 6 | `create_hub_clinical_timeline_events.sql` | Ledger da timeline canônica. |
| 7 | `create_hub_clinical_document_versions.sql` | Snapshots de audit do encounter. |
| 8 | `create_hub_clinical_exams.sql` | Exames estruturados. |
| 9 | `alter_hub_clinical_attachments_add_exam.sql` | Coluna `hub_exam_id` em anexos. |
| 10 | `create_hub_prescription_documents.sql` | `hub_case_id` em prescrições + tabela `hub_prescription_documents`. |
| 11 | `alter_hub_vaccination_records_fase6.sql` | Vacinas: fonte, lote, caso, estoque, etc. |
| 12 | `create_hub_hospitalization_events.sql` | Eventos por horário na internação. |
| 13 | `alter_hub_hospitalizations_fase7.sql` | Internação: caso, motivo, status ampliado. |
| 14 | `alter_hub_surgeries_fase8.sql` | Cirurgias: caso, pré-op, ASA, JSONB equipe/materiais. |
| 15 | `alter_hub_comandas_fase9.sql` | Comanda: `hub_case_id`, `hub_encounter_id`. |

> **Nota:** outras migrations do Hub (pets, encounters base, prescrições base, etc.) já devem existir no histórico do banco. Esta lista cobre o **pacote Clínica** entregue na reformulação recente.

---

## Como aplicar

1. Conecte-se ao Postgres do ambiente (Supabase SQL Editor, `psql`, etc.).
2. Execute os arquivos **na ordem da tabela** (1 → 15).
3. Após scripts que alteram schema, recarregue o PostgREST quando aplicável (muitos arquivos terminam com `NOTIFY pgrst, 'reload schema';`).

**Idempotência:** os scripts usam `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` onde possível; o **backfill** deve ser idempotente ao design atual (só preenche `hub_case_id` nulo).

---

## Checklist de verificação

Execute após o passo **3** (backfill) e antes do passo **5** (NOT NULL):

```sql
-- Encounters ativos sem caso (deve retornar 0 linhas antes do NOT NULL)
SELECT id, clinic_id, pet_id, status
FROM public.hub_encounters
WHERE deleted_at IS NULL
  AND hub_case_id IS NULL;
```

Após o passo **5**:

```sql
-- Coluna existe e é obrigatória para novos inserts
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'hub_encounters'
  AND column_name IN ('hub_case_id', 'encounter_type');
```

Smoke **aplicação** (sem implementar código):

- Abrir **Clínica → Atendimentos** sem erro de coluna (`hub_case_id`).
- Abrir um **caso** na rota de casos, se houver dado.

---

## Problemas comuns

| Erro | Causa provável |
|------|----------------|
| `column hub_encounters.hub_case_id does not exist` | Passos 1–2 não aplicados neste banco ou apontando para outro projeto. |
| Falha de FK ao inserir encounter | Caso não existe ou `hub_case_id` inválido. |
| PostgREST não vê colunas novas | Falta `NOTIFY pgrst` ou reload manual do schema. |

---

## Referências

- [docs/clinical-business-rules.md](clinical-business-rules.md) — regras de negócio oficiais.
- [docs/clinic-closeout-plan-revised.md](clinic-closeout-plan-revised.md) — ordem de ondas de implementação (**A → B1 → B2 → C → …**).
