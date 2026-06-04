-- PetMi Hub — Fase 9: ligar comanda ao caso clínico e ao encounter.
-- Permite abrir comanda diretamente pelo caso ou pelo atendimento concluído.

ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS hub_case_id uuid
    REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hub_encounter_id uuid
    REFERENCES public.hub_encounters(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_comandas.hub_case_id     IS 'Caso clínico de origem desta comanda (quando aberta pelo caso).';
COMMENT ON COLUMN public.hub_comandas.hub_encounter_id IS 'Atendimento de origem desta comanda (quando aberta pelo atendimento concluído).';

-- Índice para consulta por caso
CREATE INDEX IF NOT EXISTS idx_hub_comandas_hub_case_id
  ON public.hub_comandas (hub_case_id)
  WHERE deleted_at IS NULL AND hub_case_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
