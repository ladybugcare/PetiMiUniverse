-- PetMi Hub — catálogo de recursos físicos (banheira, mesa, consultório, bloco).
-- Pré-requisitos: clinics, units, hub_service_types, hub_appointments.
-- Leva e Traz continua na frota (hub_pickup_vehicles) e não usa este catálogo.

CREATE TABLE IF NOT EXISTS public.hub_resource_group_settings (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  service_group_slug text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, service_group_slug),
  CONSTRAINT hub_resource_group_settings_slug CHECK (
    service_group_slug ~ '^[a-z0-9_]+$' AND length(service_group_slug) BETWEEN 1 AND 64
  )
);

COMMENT ON TABLE public.hub_resource_group_settings IS
  'Liga o catálogo de recursos para um grupo de serviço. Desligado, a agenda segue com texto livre.';

CREATE TABLE IF NOT EXISTS public.hub_resource_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  service_group_slug text NOT NULL,
  name text NOT NULL,
  allocation_policy text NOT NULL DEFAULT 'optional' CHECK (
    allocation_policy IN ('optional', 'prompt_on_start', 'required_on_start')
  ),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_resource_kinds_slug CHECK (
    service_group_slug ~ '^[a-z0-9_]+$' AND length(service_group_slug) BETWEEN 1 AND 64
  ),
  CONSTRAINT hub_resource_kinds_name_len CHECK (length(trim(name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hub_resource_kinds_name
  ON public.hub_resource_kinds (clinic_id, service_group_slug, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_resource_kinds_clinic_group
  ON public.hub_resource_kinds (clinic_id, service_group_slug)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_resource_kinds IS
  'Nome que a tela usa (Banheira, Consultório) e a política de alocação, por grupo de serviço.';
COMMENT ON COLUMN public.hub_resource_kinds.allocation_policy IS
  'optional: pode ficar vazio; prompt_on_start: pede ao iniciar e permite seguir sem alocar; required_on_start: não inicia sem recurso.';

DROP TRIGGER IF EXISTS update_hub_resource_kinds_updated_at ON public.hub_resource_kinds;
CREATE TRIGGER update_hub_resource_kinds_updated_at
  BEFORE UPDATE ON public.hub_resource_kinds
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TABLE IF NOT EXISTS public.hub_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  resource_kind_id uuid NOT NULL REFERENCES public.hub_resource_kinds(id) ON DELETE RESTRICT,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_resources_name_len CHECK (length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hub_resources_name
  ON public.hub_resources (unit_id, resource_kind_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_resources_unit_kind
  ON public.hub_resources (unit_id, resource_kind_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_resources IS
  'Recurso físico de uma unidade (Banheira 1, Consultório 2). Capacidade exclusiva nesta fase.';

DROP TRIGGER IF EXISTS update_hub_resources_updated_at ON public.hub_resources;
CREATE TRIGGER update_hub_resources_updated_at
  BEFORE UPDATE ON public.hub_resources
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TABLE IF NOT EXISTS public.hub_service_type_resource_kinds (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE CASCADE,
  resource_kind_id uuid NOT NULL REFERENCES public.hub_resource_kinds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hub_service_type_id, resource_kind_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_service_type_resource_kinds_clinic
  ON public.hub_service_type_resource_kinds (clinic_id, hub_service_type_id);

COMMENT ON TABLE public.hub_service_type_resource_kinds IS
  'Restringe o serviço a alguns tipos do grupo. Sem linhas, o serviço aceita todos os tipos do grupo.';

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS hub_resource_id uuid REFERENCES public.hub_resources(id) ON DELETE SET NULL;

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS resource_released_at timestamptz;

COMMENT ON COLUMN public.hub_appointments.resource_label IS
  'Cópia do nome do recurso na alocação, ou texto livre quando o grupo não tem catálogo.';

COMMENT ON COLUMN public.hub_appointments.hub_resource_id IS
  'Recurso do catálogo. Nulo quando a alocação fica para a hora do atendimento ou o grupo usa texto livre.';

COMMENT ON COLUMN public.hub_appointments.resource_released_at IS
  'Quando preenchido, o recurso já foi liberado e o restante da janela não ocupa o equipamento.';

CREATE INDEX IF NOT EXISTS idx_hub_appointments_resource
  ON public.hub_appointments (hub_resource_id, starts_at)
  WHERE deleted_at IS NULL AND hub_resource_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
