-- PetMi Hub — snapshot/override de pelagem na precificação por linha de agendamento.
-- Idempotente. Executar depois de alter_hub_appointment_services_pricing_snapshots.sql.

ALTER TABLE public.hub_appointment_services
  ADD COLUMN IF NOT EXISTS pricing_coat_type_applied text;

COMMENT ON COLUMN public.hub_appointment_services.pricing_coat_type_applied IS 'Pelagem usada para precificar esta linha (curto, medio, longo, …). NULL se serviço sem matriz de pelagem.';

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS pricing_coat_type text;

COMMENT ON COLUMN public.hub_appointments.pricing_coat_type IS 'Override de pelagem para este agendamento: auto (NULL), ou slug concreto (curto, medio, longo, …).';
