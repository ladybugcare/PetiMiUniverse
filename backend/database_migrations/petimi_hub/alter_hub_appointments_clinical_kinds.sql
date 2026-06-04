-- PetMi Hub — categorias de agenda para atendimento clínico imediato vs agendado.
-- Pré-requisitos: create_hub_appointments.sql (CHECK em appointment_kind).

ALTER TABLE public.hub_appointments DROP CONSTRAINT IF EXISTS hub_appointments_appointment_kind_check;

ALTER TABLE public.hub_appointments ADD CONSTRAINT hub_appointments_appointment_kind_check CHECK (appointment_kind IN (
  'standard',
  'hotel_stay',
  'daycare_block',
  'pickup_route',
  'clinical_walk_in',
  'clinical_emergency'
));

COMMENT ON COLUMN public.hub_appointments.appointment_kind IS
  'standard: agendamento comum; hotel_stay/daycare_block/pickup_route: operacionais; clinical_walk_in: atendimento clínico imediato (encaixe); clinical_emergency: urgência registrada na agenda no momento da abertura.';

NOTIFY pgrst, 'reload schema';
