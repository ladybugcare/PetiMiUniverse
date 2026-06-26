-- Templates de mensagem WhatsApp customizáveis por clínica.
-- Permite sobrescrever os textos padrão (hardcoded em hubMessageTemplates.ts)
-- sem custo extra — o mecanismo ainda é click-to-chat wa.me (MVP, sem API paga).

ALTER TABLE public.hub_clinic_settings
  ADD COLUMN IF NOT EXISTS message_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hub_clinic_settings.message_templates IS
  'Templates de mensagem WhatsApp customizados pela clínica. Objeto JSON com chaves opcionais: pet_ready, pet_on_the_way, appointment_reminder. Chave ausente = usa o texto padrão do sistema.';
