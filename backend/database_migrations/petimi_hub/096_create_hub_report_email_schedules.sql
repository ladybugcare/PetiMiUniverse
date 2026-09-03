-- PetMi Hub — agendamentos de envio de relatórios por e-mail (Fase 7).
-- Pré-requisitos: clinics, units, clinic_users.

CREATE TABLE IF NOT EXISTS public.hub_report_email_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  report_id text NOT NULL,
  cadence text NOT NULL DEFAULT 'weekly'
    CHECK (cadence IN ('weekly')),
  recipient_email text NOT NULL,
  period_days integer NOT NULL DEFAULT 30
    CHECK (period_days >= 7 AND period_days <= 366),
  active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  last_status text
    CHECK (last_status IS NULL OR last_status IN ('queued', 'sent', 'failed', 'skipped')),
  last_error text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_report_email_schedules_active
  ON public.hub_report_email_schedules (clinic_id, report_id, lower(recipient_email))
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_hub_report_email_schedules_clinic
  ON public.hub_report_email_schedules (clinic_id, active);

COMMENT ON TABLE public.hub_report_email_schedules IS
  'Preferências de envio semanal de relatórios do Hub por e-mail. O disparo efetiva depende do provedor de e-mail configurado.';

DROP TRIGGER IF EXISTS update_hub_report_email_schedules_updated_at ON public.hub_report_email_schedules;
CREATE TRIGGER update_hub_report_email_schedules_updated_at
  BEFORE UPDATE ON public.hub_report_email_schedules
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
