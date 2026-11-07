-- PetMi Hub — Hotel & Creche: turnos de creche, horários de recreação e política de lotação (Fase 7).
-- Pré-requisitos: 052_create_hub_unit_boarding_settings.sql, 051_create_hub_boarding_reservations.sql.

ALTER TABLE public.hub_unit_boarding_settings
  ADD COLUMN IF NOT EXISTS daycare_shifts jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.hub_unit_boarding_settings
  ADD COLUMN IF NOT EXISTS recreation_windows jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.hub_unit_boarding_settings
  ADD COLUMN IF NOT EXISTS recreation_capacity integer
    CHECK (recreation_capacity IS NULL OR recreation_capacity > 0);

ALTER TABLE public.hub_unit_boarding_settings
  ADD COLUMN IF NOT EXISTS overbooking_policy text NOT NULL DEFAULT 'warn'
    CHECK (overbooking_policy IN ('warn', 'block'));

COMMENT ON COLUMN public.hub_unit_boarding_settings.daycare_shifts IS
  'Turnos da creche: [{ key, label, start: HH:MM, end: HH:MM }]. Vazio = só integral/meio período.';
COMMENT ON COLUMN public.hub_unit_boarding_settings.recreation_windows IS
  'Horários de recreação coletiva: [{ start: HH:MM, end: HH:MM, label }]. Hóspedes liberados participam como tarefa da hospedagem.';
COMMENT ON COLUMN public.hub_unit_boarding_settings.overbooking_policy IS
  'warn = alerta ao exceder capacidade; block = impede check-in acima da capacidade.';

ALTER TABLE public.hub_boarding_reservations
  ADD COLUMN IF NOT EXISTS daycare_shift_key text;

COMMENT ON COLUMN public.hub_boarding_reservations.daycare_shift_key IS
  'Creche: chave do turno (hub_unit_boarding_settings.daycare_shifts[].key).';

NOTIFY pgrst, 'reload schema';
