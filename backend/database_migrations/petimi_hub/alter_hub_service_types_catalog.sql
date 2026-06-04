-- PetMi Hub — catálogo de serviços: grupo operacional, metadados e unicidade de código só em registos não arquivados.
-- Executar depois de `create_hub_service_types.sql`.
-- Pré-requisito: função `moddatetime` (trigger já existente na tabela).

-- Novos campos (nullable primeiro para backfill seguro)
ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS service_group text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS allow_scheduling boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS agenda_color text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS code_locked boolean NOT NULL DEFAULT false;

-- Backfill grupo a partir dos códigos conhecidos do bootstrap
UPDATE public.hub_service_types
SET service_group = CASE code
  WHEN 'consulta' THEN 'clinica'
  WHEN 'banho_tosa' THEN 'banho_tosa'
  WHEN 'hotel_daycare' THEN 'hotel'
  ELSE 'outros'
END
WHERE service_group IS NULL;

UPDATE public.hub_service_types
SET service_group = 'outros'
WHERE service_group IS NULL OR trim(service_group) = '';

ALTER TABLE public.hub_service_types
  ALTER COLUMN service_group SET NOT NULL,
  ALTER COLUMN service_group SET DEFAULT 'outros';

ALTER TABLE public.hub_service_types
  DROP CONSTRAINT IF EXISTS hub_service_types_clinic_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_service_types_clinic_code_unique_active
  ON public.hub_service_types (clinic_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_service_types_clinic_group
  ON public.hub_service_types (clinic_id, service_group)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.hub_service_types.service_group IS 'Grupo: banho_tosa, hotel, creche, clinica, cirurgia, leva_traz, outros';
COMMENT ON COLUMN public.hub_service_types.allow_scheduling IS 'Se o serviço pode ser escolhido em novos agendamentos (quando inativo/arquivado, a agenda ignora).';
COMMENT ON COLUMN public.hub_service_types.code_locked IS 'Se true, alterações de nome não recalculam o código (integrações / agendamentos futuros).';
COMMENT ON COLUMN public.hub_service_types.agenda_color IS 'Cor hex opcional (#RRGGBB) para visualização na agenda.';
