-- Pedido de serviço no salão (ex.: desembolo): evento na sessão + aviso à recepção para autorização do tutor.
-- Pré-requisitos: 031 (hub_grooming_events), 101 (notifications_type_check).

ALTER TABLE public.hub_grooming_events
  DROP CONSTRAINT IF EXISTS hub_grooming_events_event_type_check;

ALTER TABLE public.hub_grooming_events
  ADD CONSTRAINT hub_grooming_events_event_type_check CHECK (event_type IN (
    'check_in',
    'start',
    'pause',
    'resume',
    'staff_change',
    'stage_change',
    'note',
    'extra_request',
    'ready',
    'delivered',
    'closed'
  ));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'application_received',
    'application_accepted',
    'application_rejected',
    'support_reply',
    'unit_invitation',
    'marketplace_message',
    'demand_status_changed',
    'new_demand_created',
    'demand_invite',
    'invite_accepted',
    'invite_rejected',
    'check_in',
    'report_submitted',
    'report_approved',
    'hub_pet_ready',
    'hub_pet_on_the_way',
    'hub_payment_due',
    'hub_cancellation_pending',
    'hub_stock_alert',
    'hub_boarding_checkin',
    'hub_boarding_checkout',
    'hub_grooming_extra_request'
  ));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
  'Tipos válidos de notificação. Os tipos hub_* são avisos internos à equipe (não ao tutor).';

NOTIFY pgrst, 'reload schema';
