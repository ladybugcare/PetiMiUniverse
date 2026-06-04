-- PetMi Hub — cadastro de equipe (profissionais com ou sem acesso ao Hub).
-- Pré-requisitos: `clinics`, `units`, `hub_service_types`, `clinic_users`, função `moddatetime`.
-- Profissional sem login: `has_hub_access = false` e `clinic_user_id` NULL; ainda pode ser usado em agenda (futuro).
-- `hub_access_role`: valores aceites por `user_invitations` / `clinic_users` (CADMIN, CMANAGER, CASSISTANT, CVET_INTERNAL).

CREATE TABLE IF NOT EXISTS public.hub_staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  display_name text,
  photo_url text,
  phone text,
  whatsapp_phone text,
  email text,
  birth_date date,
  job_title text NOT NULL,
  professional_kind text NOT NULL CHECK (professional_kind IN (
    'vet', 'groomer', 'bather', 'reception', 'driver', 'caretaker', 'assistant', 'other'
  )),
  specialties text,
  crmv text,
  crmv_uf text,
  internal_notes text,
  active boolean NOT NULL DEFAULT true,
  has_hub_access boolean NOT NULL DEFAULT false,
  hub_access_email text,
  hub_access_role text,
  accepts_appointments boolean NOT NULL DEFAULT false,
  available_days jsonb,
  work_hours jsonb,
  break_minutes int,
  default_unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  agenda_color text,
  clinic_user_id uuid REFERENCES public.clinic_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_staff_members_hub_access_role_chk CHECK (
    hub_access_role IS NULL OR hub_access_role IN ('CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL')
  )
);

CREATE INDEX IF NOT EXISTS idx_hub_staff_members_clinic_active
  ON public.hub_staff_members (clinic_id, active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_staff_members_clinic_kind
  ON public.hub_staff_members (clinic_id, professional_kind)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_staff_members IS 'Profissionais da clínica (Hub); opcional vínculo a clinic_users após convite.';
COMMENT ON COLUMN public.hub_staff_members.email IS 'Contato opcional.';
COMMENT ON COLUMN public.hub_staff_members.birth_date IS 'Data de nascimento (opcional).';
COMMENT ON COLUMN public.hub_staff_members.job_title IS 'Função/cargo exibido (obrigatório na UI).';
COMMENT ON COLUMN public.hub_staff_members.crmv IS 'Registro profissional (ex. CRMV) quando aplicável.';
COMMENT ON COLUMN public.hub_staff_members.crmv_uf IS 'UF do registro (ex. SP).';
COMMENT ON COLUMN public.hub_staff_members.available_days IS 'JSON: ex. [0,1,2] para domingo–sábado; evolução livre.';
COMMENT ON COLUMN public.hub_staff_members.work_hours IS 'JSON: janelas de trabalho por dia ou bloco único (MVP).';
COMMENT ON COLUMN public.hub_staff_members.agenda_color IS 'Cor hex opcional (#RRGGBB) na agenda.';
COMMENT ON COLUMN public.hub_staff_members.clinic_user_id IS 'Preenchido quando o profissional tem login PetMi e vínculo clinic_users.';

DROP TRIGGER IF EXISTS update_hub_staff_members_updated_at ON public.hub_staff_members;
CREATE TRIGGER update_hub_staff_members_updated_at
  BEFORE UPDATE ON public.hub_staff_members
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Serviços que o profissional pode realizar (N:N com hub_service_types)
CREATE TABLE IF NOT EXISTS public.hub_staff_service_types (
  staff_id uuid NOT NULL REFERENCES public.hub_staff_members(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_staff_service_types_service
  ON public.hub_staff_service_types (service_type_id);

COMMENT ON TABLE public.hub_staff_service_types IS 'Catálogo de serviços (hub_service_types) que cada membro da equipe pode realizar.';
