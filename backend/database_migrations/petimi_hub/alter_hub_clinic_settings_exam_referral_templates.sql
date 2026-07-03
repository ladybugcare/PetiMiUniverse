-- Migration 67: defaults e templates WhatsApp para exames e encaminhamentos
ALTER TABLE hub_clinic_settings
  ADD COLUMN IF NOT EXISTS exam_order_defaults jsonb NOT NULL DEFAULT '{"validity_days": 30}',
  ADD COLUMN IF NOT EXISTS specialist_referral_defaults jsonb NOT NULL DEFAULT '{"validity_days": 30}';

-- message_templates já existe (alter_hub_clinic_settings_message_templates.sql)
-- Chaves sugeridas: exam_order_share, specialist_referral_share

COMMENT ON COLUMN hub_clinic_settings.exam_order_defaults IS
  'JSON: validity_days, disclaimer_text opcional para solicitação de exames';

COMMENT ON COLUMN hub_clinic_settings.specialist_referral_defaults IS
  'JSON: validity_days, disclaimer_text opcional para encaminhamento a especialista';
