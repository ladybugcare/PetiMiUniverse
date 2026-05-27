-- PetMi Hub — snapshot de preço por linha de serviço no agendamento (financeiro / auditoria).
-- Idempotente. Executar depois de alter_hub_appointments_multi_service_and_recurrence.sql.

ALTER TABLE public.hub_appointment_services
  ADD COLUMN IF NOT EXISTS pricing_porte_tier_applied text,
  ADD COLUMN IF NOT EXISTS cost_amount_applied numeric(12, 2),
  ADD COLUMN IF NOT EXISTS sale_amount_applied numeric(12, 2);

COMMENT ON COLUMN public.hub_appointment_services.pricing_porte_tier_applied IS 'Tier usado para precificar esta linha (ex.: filhote, mini). NULL se serviço sem matriz porte.';
COMMENT ON COLUMN public.hub_appointment_services.cost_amount_applied IS 'Custo (BRL) aplicado neste agendamento para esta linha.';
COMMENT ON COLUMN public.hub_appointment_services.sale_amount_applied IS 'Venda (BRL) aplicada neste agendamento para esta linha.';

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS pricing_porte_tier text;

COMMENT ON COLUMN public.hub_appointments.pricing_porte_tier IS 'Override de tier para este agendamento: auto (NULL), ou slug concreto (mini, filhote, …).';
