-- PetMi Hub — Casos Clínicos (Fase 1 Clínica).
-- Pré-requisitos: clinics, units, hub_pets, hub_guardians, hub_staff_members, moddatetime.
-- Cada pet pode ter múltiplos casos. Cada caso agrupa atendimentos, exames, prescrições, etc.

CREATE TABLE IF NOT EXISTS public.hub_clinical_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE RESTRICT,
  -- Snapshot histórico do tutor no momento da abertura do caso.
  -- A verdade atual do tutor vem de hub_pet_guardians, não deste campo.
  guardian_id_snapshot uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  primary_veterinarian_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'monitoring', 'resolved', 'cancelled')),
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_clinical_cases_clinic_pet
  ON public.hub_clinical_cases (clinic_id, pet_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_clinical_cases_clinic_status
  ON public.hub_clinical_cases (clinic_id, status)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_clinical_cases IS 'Agrupa episódios clínicos de um pet (atendimentos, exames, prescrições, internações, cirurgias).';
COMMENT ON COLUMN public.hub_clinical_cases.guardian_id_snapshot IS 'Snapshot do tutor principal no momento da abertura. Não atualizar automaticamente; tutor atual vem de hub_pet_guardians.';
COMMENT ON COLUMN public.hub_clinical_cases.status IS 'active: em acompanhamento ativo; monitoring: monitoramento contínuo; resolved: resolvido; cancelled: cancelado/equivocado.';
COMMENT ON COLUMN public.hub_clinical_cases.closed_at IS 'Preenchido quando status muda para resolved ou cancelled.';

DROP TRIGGER IF EXISTS update_hub_clinical_cases_updated_at ON public.hub_clinical_cases;
CREATE TRIGGER update_hub_clinical_cases_updated_at
  BEFORE UPDATE ON public.hub_clinical_cases
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
