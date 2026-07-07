-- Item 62: validade padrão e disclaimers de receita validável por clínica
ALTER TABLE public.hub_clinic_settings
  ADD COLUMN IF NOT EXISTS prescription_defaults jsonb NOT NULL DEFAULT '{"validity_days":30}';

COMMENT ON COLUMN public.hub_clinic_settings.prescription_defaults IS 'Defaults de receita validável: validity_days, disclaimer_text opcional.';

NOTIFY pgrst, 'reload schema';
