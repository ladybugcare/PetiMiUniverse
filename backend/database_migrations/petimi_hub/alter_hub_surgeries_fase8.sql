-- PetMi Hub — Cirurgias avançadas: pré-op, risco anestésico, equipe, materiais, pós-op (Fase 8 Clínica).
-- Equipe e materiais ficam em JSONB na v1 (sem child tables).
-- Pré-requisitos: create_hub_surgeries.sql, create_hub_clinical_cases.sql.

ALTER TABLE public.hub_surgeries
  ADD COLUMN IF NOT EXISTS hub_case_id uuid
    REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hub_encounter_id uuid
    REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  -- Pré-operatório estruturado (JSONB)
  -- Campos sugeridos: fasting_hours, premedication, lab_results, ecg, imaging, notes
  ADD COLUMN IF NOT EXISTS pre_op jsonb NOT NULL DEFAULT '{}',
  -- Risco anestésico ASA (I a VI, E para emergência)
  ADD COLUMN IF NOT EXISTS anesthetic_risk text
    CHECK (anesthetic_risk IS NULL OR anesthetic_risk IN ('I', 'II', 'III', 'IV', 'V', 'VI', 'E')),
  -- Detalhes intra-operatórios (JSONB)
  -- Campos sugeridos: technique, anesthesia_type, duration_min, complications, notes
  ADD COLUMN IF NOT EXISTS procedure jsonb NOT NULL DEFAULT '{}',
  -- Equipe cirúrgica em JSONB na v1
  -- Ex.: [{ "role": "surgeon", "name": "Dr. João" }, { "role": "anesthesiologist", "name": "Dra. Ana" }]
  ADD COLUMN IF NOT EXISTS team jsonb NOT NULL DEFAULT '[]',
  -- Materiais/instrumentais em JSONB na v1
  -- Ex.: [{ "item": "Fio Vicryl 2-0", "quantity": 2 }, { "item": "Bandagem", "quantity": 1 }]
  ADD COLUMN IF NOT EXISTS materials jsonb NOT NULL DEFAULT '[]',
  -- Pós-operatório (JSONB)
  -- Campos sugeridos: recovery_notes, medications, restrictions, follow_up_date
  ADD COLUMN IF NOT EXISTS post_op jsonb NOT NULL DEFAULT '{}',
  -- Data/hora de alta cirúrgica
  ADD COLUMN IF NOT EXISTS discharge_at timestamptz;

COMMENT ON COLUMN public.hub_surgeries.hub_case_id IS 'Caso clínico ao qual esta cirurgia pertence.';
COMMENT ON COLUMN public.hub_surgeries.pre_op IS 'Pré-operatório: jejum, pré-medicação, exames, notas.';
COMMENT ON COLUMN public.hub_surgeries.anesthetic_risk IS 'Classificação ASA: I, II, III, IV, V, VI ou E (emergência).';
COMMENT ON COLUMN public.hub_surgeries.procedure IS 'Intra-operatório: técnica, anestesia, duração, intercorrências.';
COMMENT ON COLUMN public.hub_surgeries.team IS 'Equipe cirúrgica em JSONB (v1). Promover a child table em versão futura.';
COMMENT ON COLUMN public.hub_surgeries.materials IS 'Materiais utilizados em JSONB (v1). Promover a hub_inventory_item_id em versão futura.';
COMMENT ON COLUMN public.hub_surgeries.post_op IS 'Pós-operatório: recuperação, medicações, restrições, retorno.';
COMMENT ON COLUMN public.hub_surgeries.discharge_at IS 'Alta cirúrgica.';

NOTIFY pgrst, 'reload schema';
