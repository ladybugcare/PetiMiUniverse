-- Amplia o CHECK de notifications.type para incluir tipos internos do Hub.
-- Os tipos abaixo já existem no TypeScript (notificationsController.ts) mas
-- não estavam registrados na restrição SQL original do sistema Vet.

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
    -- Tipos já usados no TS mas ausentes do CHECK original
    'demand_invite',
    'invite_accepted',
    'invite_rejected',
    'check_in',
    'report_submitted',
    'report_approved',
    -- Tipos Hub (Epic 9 — comunicação operacional interna)
    'hub_pet_ready',
    'hub_pet_on_the_way'
  ));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
  'Tipos válidos de notificação. hub_pet_ready e hub_pet_on_the_way são avisos internos à equipe (não ao tutor).';
