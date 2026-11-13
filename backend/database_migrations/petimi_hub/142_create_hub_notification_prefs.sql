-- PetMi Hub — preferências de notificações in-app por usuário e clínica.
-- Opt-out: ausência de linha = categoria ligada.
-- Pré-requisitos: clinics, auth.users (ou equivalente), moddatetime.
-- Categorias: acoes | operacao | alertas (ver hubNotificationPrefs.ts).

CREATE TABLE IF NOT EXISTS public.hub_notification_prefs (
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('acoes', 'operacao', 'alertas')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clinic_id, category)
);

COMMENT ON TABLE public.hub_notification_prefs IS
  'Preferências de avisos in-app do Hub por usuário e clínica. Sem linha = ligado.';
COMMENT ON COLUMN public.hub_notification_prefs.category IS
  'acoes = autorização/cobrança/cancelamento; operacao = fluxo do dia; alertas = estoque.';

CREATE INDEX IF NOT EXISTS idx_hub_notification_prefs_clinic_user
  ON public.hub_notification_prefs (clinic_id, user_id);

DROP TRIGGER IF EXISTS update_hub_notification_prefs_updated_at ON public.hub_notification_prefs;
CREATE TRIGGER update_hub_notification_prefs_updated_at
  BEFORE UPDATE ON public.hub_notification_prefs
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
