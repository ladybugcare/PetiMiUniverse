-- PetMi Hub — Vacinas completas (Fase 6 Clínica).
-- Adiciona origem, lote de estoque, fabricante, validade, comprovante e vínculo ao caso.
-- Pré-requisitos: create_hub_prescriptions_vaccinations.sql, create_hub_clinical_cases.sql,
--                create_hub_inventory.sql, alter_hub_clinical_attachments_add_exam.sql.

-- Origem: vacina aplicada na clínica ou registrada como externa
ALTER TABLE public.hub_vaccination_records
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'in_clinic'
    CHECK (source IN ('in_clinic', 'external')),
  -- Fabricante da vacina
  ADD COLUMN IF NOT EXISTS manufacturer text,
  -- Vínculo com item de estoque (vacina do estoque da clínica)
  ADD COLUMN IF NOT EXISTS hub_inventory_item_id uuid
    REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  -- Lote de estoque específico utilizado
  ADD COLUMN IF NOT EXISTS hub_inventory_lot_id uuid
    REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL,
  -- Data de validade da vacina (campo estruturado, além do lote)
  ADD COLUMN IF NOT EXISTS expiry_date date,
  -- Comprovante/certificado (para vacinas externas ou registro formal)
  ADD COLUMN IF NOT EXISTS proof_attachment_id uuid
    REFERENCES public.hub_clinical_attachments(id) ON DELETE SET NULL,
  -- Caso clínico ao qual esta vacinação pertence
  ADD COLUMN IF NOT EXISTS hub_case_id uuid
    REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  -- Indica se a baixa de estoque já foi processada
  ADD COLUMN IF NOT EXISTS stock_movement_id uuid
    REFERENCES public.hub_stock_movements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_vaccination_records.source IS 'in_clinic: aplicada na clínica (pode baixar estoque); external: registrada como vacina externa (sem baixa).';
COMMENT ON COLUMN public.hub_vaccination_records.hub_inventory_item_id IS 'Item de estoque vinculado (vacina do catálogo). Obrigatório para baixa de estoque.';
COMMENT ON COLUMN public.hub_vaccination_records.hub_inventory_lot_id IS 'Lote específico utilizado. Obrigatório para rastreabilidade da baixa.';
COMMENT ON COLUMN public.hub_vaccination_records.stock_movement_id IS 'Movimentação de estoque gerada pela aplicação. NULL = sem baixa processada.';
COMMENT ON COLUMN public.hub_vaccination_records.proof_attachment_id IS 'Anexo de comprovante/certificado de vacinação.';

NOTIFY pgrst, 'reload schema';
