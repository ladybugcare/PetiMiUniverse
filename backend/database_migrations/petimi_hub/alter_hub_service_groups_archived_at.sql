-- PetMi Hub — arquivar grupos de serviço (ocultar em pickers; serviços existentes mantêm o slug).
-- Executar após `create_hub_service_groups.sql`.

ALTER TABLE public.hub_service_groups
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN public.hub_service_groups.archived_at IS
  'Quando preenchido, o grupo não aparece em comboboxes de novo serviço; `ensureDefaultHubServiceGroups` não recria o slug porque a linha continua a existir.';

CREATE INDEX IF NOT EXISTS idx_hub_service_groups_clinic_active
  ON public.hub_service_groups (clinic_id)
  WHERE archived_at IS NULL;
