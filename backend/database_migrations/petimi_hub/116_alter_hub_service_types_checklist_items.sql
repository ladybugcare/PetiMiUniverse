-- PetMi Hub — checklist operacional opcional por tipo de serviço.
-- NULL = herda o template do grupo (hub_service_group_checklist_templates / default do sistema).
-- Forma: [{ "key": "nails", "label": "Unhas cortadas", "default_checked": false }, ...]

ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS checklist_items jsonb NULL;

COMMENT ON COLUMN public.hub_service_types.checklist_items IS
  'Override de checklist operacional por tipo; NULL herda o template do grupo de serviço.';

NOTIFY pgrst, 'reload schema';
