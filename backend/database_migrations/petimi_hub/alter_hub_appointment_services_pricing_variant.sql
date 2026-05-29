-- PetMi Hub — variantes de preço (período, consulta, faixa km) nas linhas de serviço do agendamento.
-- Idempotente. Executar após alter_hub_appointment_services_coat_pricing_snapshots.sql (se existir).

ALTER TABLE public.hub_appointment_services
  ADD COLUMN IF NOT EXISTS pricing_variant jsonb;

COMMENT ON COLUMN public.hub_appointment_services.pricing_variant IS
  'Variante de matriz aplicada (ex.: km_tier_index para Leva e Traz, period para creche).';

NOTIFY pgrst, 'reload schema';
