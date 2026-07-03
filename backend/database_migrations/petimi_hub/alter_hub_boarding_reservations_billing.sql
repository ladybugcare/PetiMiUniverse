-- Item 57: billing waive na reserva + CHECK boarding_reservation em comandas e recebíveis
ALTER TABLE public.hub_boarding_reservations
  ADD COLUMN IF NOT EXISTS billing_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_waive_reason text;

ALTER TABLE public.hub_comandas DROP CONSTRAINT IF EXISTS hub_comandas_origin_type_check;
ALTER TABLE public.hub_comandas ADD CONSTRAINT hub_comandas_origin_type_check
  CHECK (origin_type IN (
    'appointment', 'grooming_session', 'encounter', 'quote',
    'boarding_reservation', 'hotel_stay', 'daycare', 'transport',
    'package', 'subscription', 'manual'
  ));

ALTER TABLE public.hub_receivables DROP CONSTRAINT IF EXISTS hub_receivables_source_type_check;
ALTER TABLE public.hub_receivables ADD CONSTRAINT hub_receivables_source_type_check
  CHECK (source_type IN (
    'grooming_session',
    'encounter',
    'quote',
    'appointment',
    'boarding_reservation',
    'manual'
  ));

NOTIFY pgrst, 'reload schema';
