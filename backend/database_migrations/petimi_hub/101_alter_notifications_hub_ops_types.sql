-- PetMi Hub — amplia notifications.type com os avisos operacionais internos do Hub.
-- Pré-requisito: 053_alter_notifications_hub_types.sql (que já registrou hub_pet_ready / hub_pet_on_the_way).
-- Estes tipos são direcionados por área operacional (recepção, caixa, financeiro, estoque, hotel)
-- pelo helper hubNotifyStaff — nunca são enviados ao tutor.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    -- Tipos originais do sistema Vet
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
    -- Tipos Hub (Epic 9 — comunicação operacional interna)
    'hub_pet_ready',
    'hub_pet_on_the_way',
    -- Tipos Hub operacionais por área (MVP notificações por tipo de usuário)
    'hub_payment_due',
    'hub_cancellation_pending',
    'hub_stock_alert',
    'hub_boarding_checkin',
    'hub_boarding_checkout'
  ));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
  'Tipos válidos de notificação. Os tipos hub_* são avisos internos à equipe (não ao tutor), '
  'direcionados por área operacional / papel via hubNotifyStaff.';

NOTIFY pgrst, 'reload schema';
