-- PetMi Hub — tutores (guardians) por clínica
-- Executar no Supabase SQL Editor (ou psql) após existir `clinics` e, se aplicável, a função `moddatetime` (ver create_moddatetime_function.sql).
--
-- QA manual sugerido:
-- 1) Dois utilizadores de clínicas diferentes: GET /api/hub/guardians?clinic_id=... não deve cruzar linhas.
-- 2) CASSISTANT: GET OK se tiver hub.guardians.read; POST/PATCH 403 sem hub.guardians.write.
-- 3) CVET_INTERNAL: sem permissões Hub → 403 em todas as rotas /api/hub/guardians.

CREATE TABLE IF NOT EXISTS hub_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_guardians_clinic_active
  ON public.hub_guardians (clinic_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_guardians IS 'Tutores/responsáveis por pets — domínio PetMi Hub; escopo por clinic_id.';

-- Atualização automática de updated_at (requer função moddatetime no projeto)
DROP TRIGGER IF EXISTS update_hub_guardians_updated_at ON public.hub_guardians;
CREATE TRIGGER update_hub_guardians_updated_at
  BEFORE UPDATE ON public.hub_guardians
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
