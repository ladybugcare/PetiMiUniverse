-- PetMi Hub — endereço estruturado em hub_partner_clinics (padrão tutores/unidades).
-- Pré-requisito: 093_create_hub_partner_clinics_care_location.sql

ALTER TABLE public.hub_partner_clinics
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS complement text;

-- city já existe em 093; address_line legado → street quando street estiver vazio
UPDATE public.hub_partner_clinics
SET street = address_line
WHERE (street IS NULL OR btrim(street) = '')
  AND address_line IS NOT NULL
  AND btrim(address_line) <> '';

COMMENT ON COLUMN public.hub_partner_clinics.postal_code IS 'CEP (mesmo padrão de hub_guardians).';
COMMENT ON COLUMN public.hub_partner_clinics.state IS 'UF.';
COMMENT ON COLUMN public.hub_partner_clinics.district IS 'Bairro.';
COMMENT ON COLUMN public.hub_partner_clinics.street IS 'Logradouro.';
COMMENT ON COLUMN public.hub_partner_clinics.street_number IS 'Número.';
COMMENT ON COLUMN public.hub_partner_clinics.complement IS 'Complemento.';
COMMENT ON COLUMN public.hub_partner_clinics.address_line IS
  'Legado (linha única). Preferir street/street_number/…; mantido por compatibilidade.';
