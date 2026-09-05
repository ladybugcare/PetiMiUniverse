-- Marca serviços de aplicação na consulta (IM/IV/SC etc.) dentro do grupo clínica.
-- Sem grupo novo: is_encounter_application = true → dropdown da Medicação e comanda.
-- Executar depois de 003 / 004 (hub_service_types).

ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS is_encounter_application boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_service_types.is_encounter_application IS
  'Quando true, o serviço é aplicação in-clinic (cobrável na Medicação). Continua em service_group clinica.';

CREATE INDEX IF NOT EXISTS idx_hub_service_types_encounter_application
  ON public.hub_service_types (clinic_id)
  WHERE deleted_at IS NULL AND is_encounter_application = true AND active = true;
