-- Log de tentativas de comunicação com o tutor (Epic 9 — WhatsApp click-to-chat).
-- Registra "link aberto" (tentativa), não "mensagem entregue", pois o envio é
-- sempre manual pelo operador via WhatsApp do próprio dispositivo.
-- Sem dados sensíveis: o conteúdo da mensagem NÃO é armazenado.

CREATE TABLE IF NOT EXISTS public.hub_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp_link', 'in_app')),
  template_key text,
  triggered_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hub_message_logs IS
  'Tentativas de comunicação com tutores (click-to-chat wa.me e notificações in-app). Não armazena conteúdo da mensagem.';
COMMENT ON COLUMN public.hub_message_logs.channel IS
  'whatsapp_link = link wa.me aberto pelo operador; in_app = notificação interna da equipe.';
COMMENT ON COLUMN public.hub_message_logs.template_key IS
  'Chave do template de texto usado (ex.: pet_ready, pet_on_the_way). Null para mensagem livre.';

CREATE INDEX IF NOT EXISTS idx_hub_message_logs_clinic_created
  ON public.hub_message_logs (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_message_logs_guardian
  ON public.hub_message_logs (guardian_id, created_at DESC)
  WHERE guardian_id IS NOT NULL;
