-- PetMi Hub — notificação hub_pet_arrived (pet desembarcou do L&T na unidade).
-- Pré-requisitos: 111_alter_grooming_extra_request.sql (ou 101 + tipos hub_* já no CHECK).

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
    'hub_pet_arrived',
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
