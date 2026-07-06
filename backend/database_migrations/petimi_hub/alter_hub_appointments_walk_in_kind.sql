-- PetMi Hub — kind genérico de encaixe (walk-in) para B&T, Hotel e demais módulos não-clínicos.
-- Pré-requisitos: alter_hub_appointments_clinical_kinds.sql (CHECK em appointment_kind).

ALTER TABLE public.hub_appointments DROP CONSTRAINT IF EXISTS hub_appointments_appointment_kind_check;

ALTER TABLE public.hub_appointments ADD CONSTRAINT hub_appointments_appointment_kind_check CHECK (appointment_kind IN (
  'standard',
  'hotel_stay',
  'daycare_block',
  'pickup_route',
  'clinical_walk_in',
  'clinical_emergency',
  'walk_in'
));

COMMENT ON COLUMN public.hub_appointments.appointment_kind IS
  'standard: agendamento comum; hotel_stay/daycare_block/pickup_route: operacionais; clinical_walk_in: encaixe clínico imediato; clinical_emergency: urgência; walk_in: encaixe genérico (B&T, Hotel, etc.) registrado na agenda.';

NOTIFY pgrst, 'reload schema';
