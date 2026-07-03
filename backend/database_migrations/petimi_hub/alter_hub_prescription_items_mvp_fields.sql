-- Item 58: campos MVP de medicamento + administration (gap existente no código)
ALTER TABLE public.hub_prescription_items
  ADD COLUMN IF NOT EXISTS presentation text,
  ADD COLUMN IF NOT EXISTS concentration text,
  ADD COLUMN IF NOT EXISTS quantity text,
  ADD COLUMN IF NOT EXISTS posology text,
  ADD COLUMN IF NOT EXISTS administration text NOT NULL DEFAULT 'home_use'
    CHECK (administration IN ('home_use', 'administered_in_clinic'));

COMMENT ON COLUMN public.hub_prescription_items.presentation IS 'Apresentação (ex.: comprimido, suspensão).';
COMMENT ON COLUMN public.hub_prescription_items.concentration IS 'Concentração; fallback legado: dosage.';
COMMENT ON COLUMN public.hub_prescription_items.quantity IS 'Quantidade prescrita (texto livre).';
COMMENT ON COLUMN public.hub_prescription_items.posology IS 'Posologia completa; fallback legado: frequency.';

NOTIFY pgrst, 'reload schema';
