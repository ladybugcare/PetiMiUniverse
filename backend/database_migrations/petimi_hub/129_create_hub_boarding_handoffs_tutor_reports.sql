-- PetMi Hub — Hotel & Creche: passagem de turno e histórico de relatórios ao tutor (Fase 9).
-- Pré-requisitos: 051_create_hub_boarding_reservations.sql.

CREATE TABLE IF NOT EXISTS public.hub_boarding_shift_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  shift_label text,
  -- Foto do momento: tarefas pendentes, intercorrências abertas, pets em atenção, contagens.
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_shift_handoffs_clinic_created
  ON public.hub_boarding_shift_handoffs (clinic_id, unit_id, created_at DESC);

COMMENT ON TABLE public.hub_boarding_shift_handoffs IS
  'Passagem de turno de Hotel & Creche: o turno que sai registra pendências; o próximo dá ciência.';

CREATE TABLE IF NOT EXISTS public.hub_boarding_tutor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  report_date date,
  kind text NOT NULL DEFAULT 'daily' CHECK (kind IN ('daily', 'stay_summary', 'pickup')),
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'copy')),
  sent_by_user_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_tutor_reports_reservation
  ON public.hub_boarding_tutor_reports (hub_boarding_reservation_id, sent_at DESC);

COMMENT ON TABLE public.hub_boarding_tutor_reports IS
  'Relatórios enviados ao tutor (gerados a partir das tarefas, intercorrências e fotos da estadia).';

NOTIFY pgrst, 'reload schema';
