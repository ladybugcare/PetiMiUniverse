-- PetMi Hub — notas internas para o financeiro (sem impacto em preços por agora).
-- Idempotente.

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS financial_notes text;

COMMENT ON COLUMN public.hub_appointments.financial_notes IS 'Notas internas (descontos acordados, ajustes manuais na nota, etc.); informativo até integração financeira.';
