-- PetMi Hub — configurações por clínica (ex.: idade máxima em meses para tier «filhote» na precificação).
-- Pré-requisitos: `public.clinics`, função `moddatetime` (ver petimi_vet/create_moddatetime_function.sql).
-- Segurança: leitura/escrita via API com service role; RLS opcional no Supabase.

CREATE TABLE IF NOT EXISTS public.hub_clinic_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_puppy_max_months integer NOT NULL DEFAULT 8
    CHECK (pet_puppy_max_months >= 1 AND pet_puppy_max_months <= 24),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hub_clinic_settings IS 'Preferências Hub por clínica; uma linha por clinic_id.';
COMMENT ON COLUMN public.hub_clinic_settings.pet_puppy_max_months IS 'Idade máxima (meses completos) para aplicar tier filhote na matriz porte, face à data do agendamento.';

DROP TRIGGER IF EXISTS update_hub_clinic_settings_updated_at ON public.hub_clinic_settings;
CREATE TRIGGER update_hub_clinic_settings_updated_at
  BEFORE UPDATE ON public.hub_clinic_settings
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
