-- PetMi Hub — extras (addons) vendidos/registrados na sessão operacional Banho & Tosa (Fase 3).
-- Pré-requisitos: create_hub_grooming_sessions.sql, hub_service_types (is_addon), hub_staff_members.

CREATE TABLE IF NOT EXISTS public.hub_grooming_session_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_grooming_session_id uuid NOT NULL REFERENCES public.hub_grooming_sessions(id) ON DELETE CASCADE,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE RESTRICT,
  parent_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  sale_amount_snapshot numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_grooming_session_extras_session
  ON public.hub_grooming_session_extras (hub_grooming_session_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_grooming_session_extras IS 'Adicionais (serviços is_addon) registados na sessão operacional Banho & Tosa; snapshots de nome/preço.';

NOTIFY pgrst, 'reload schema';
