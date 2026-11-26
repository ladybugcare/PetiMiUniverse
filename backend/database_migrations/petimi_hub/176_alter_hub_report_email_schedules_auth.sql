-- Auth de agendamentos de relatórios: motivo de suspensão + status suspended.
-- Pré-requisito: 096_create_hub_report_email_schedules.sql

ALTER TABLE public.hub_report_email_schedules
  ADD COLUMN IF NOT EXISTS suspension_reason text;

ALTER TABLE public.hub_report_email_schedules
  DROP CONSTRAINT IF EXISTS hub_report_email_schedules_last_status_check;

ALTER TABLE public.hub_report_email_schedules
  ADD CONSTRAINT hub_report_email_schedules_last_status_check
  CHECK (
    last_status IS NULL
    OR last_status IN ('queued', 'sent', 'failed', 'skipped', 'suspended')
  );

COMMENT ON COLUMN public.hub_report_email_schedules.suspension_reason IS
  'Motivo da suspensão automática quando o proprietário perde autorização/membership/módulo.';

NOTIFY pgrst, 'reload schema';
