-- PetMi Hub — Horário de cada período de refeição na rotina da unidade.
-- O plano do pet marca só o período (café, almoço, lanche, janta).
-- Pré-requisito: 052_create_hub_unit_boarding_settings.sql.

ALTER TABLE public.hub_unit_boarding_settings
  ADD COLUMN IF NOT EXISTS meal_slot_times jsonb NOT NULL DEFAULT '{
    "breakfast": "08:00",
    "lunch": "12:00",
    "snack": "16:00",
    "dinner": "19:00"
  }'::jsonb;

COMMENT ON COLUMN public.hub_unit_boarding_settings.meal_slot_times IS
  'Horário (HH:MM, America/Sao_Paulo) em que cada período de refeição entra na rotina: breakfast, lunch, snack, dinner.';

NOTIFY pgrst, 'reload schema';
