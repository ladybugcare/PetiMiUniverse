-- PetMi Hub — catch-up: colunas de override de precificação em hub_appointments
-- e snapshots por linha em hub_appointment_services.
-- Idempotente. Executar no Supabase SQL Editor se aparecer:
--   «Could not find the 'pricing_coat_type' column of 'hub_appointments'»
-- ou erros similares para pricing_porte_tier / pricing_*_applied.
--
-- Equivalente aos itens 15 e 19 do README (petimi_hub), num único ficheiro.

-- ── Snapshots por linha (hub_appointment_services) ───────────────────────────
ALTER TABLE public.hub_appointment_services
  ADD COLUMN IF NOT EXISTS pricing_porte_tier_applied text,
  ADD COLUMN IF NOT EXISTS cost_amount_applied numeric(12, 2),
  ADD COLUMN IF NOT EXISTS sale_amount_applied numeric(12, 2),
  ADD COLUMN IF NOT EXISTS pricing_coat_type_applied text;

COMMENT ON COLUMN public.hub_appointment_services.pricing_porte_tier_applied IS 'Tier usado para precificar esta linha (ex.: filhote, mini). NULL se serviço sem matriz porte.';
COMMENT ON COLUMN public.hub_appointment_services.cost_amount_applied IS 'Custo (BRL) aplicado neste agendamento para esta linha.';
COMMENT ON COLUMN public.hub_appointment_services.sale_amount_applied IS 'Venda (BRL) aplicada neste agendamento para esta linha.';
COMMENT ON COLUMN public.hub_appointment_services.pricing_coat_type_applied IS 'Pelagem usada para precificar esta linha (curto, medio, longo, …). NULL se serviço sem matriz de pelagem.';

-- ── Overrides ao nível do agendamento (hub_appointments) ─────────────────────
ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS pricing_porte_tier text,
  ADD COLUMN IF NOT EXISTS pricing_coat_type text,
  ADD COLUMN IF NOT EXISTS financial_notes text;

COMMENT ON COLUMN public.hub_appointments.pricing_porte_tier IS 'Override de tier para este agendamento: auto (NULL), ou slug concreto (mini, filhote, …).';
COMMENT ON COLUMN public.hub_appointments.pricing_coat_type IS 'Override de pelagem para este agendamento: auto (NULL), ou slug concreto (curto, medio, longo, …).';
COMMENT ON COLUMN public.hub_appointments.financial_notes IS 'Notas internas para o financeiro (descontos acordados, ajustes manuais, etc.).';

-- Recarregar schema cache do PostgREST (Supabase API)
NOTIFY pgrst, 'reload schema';
