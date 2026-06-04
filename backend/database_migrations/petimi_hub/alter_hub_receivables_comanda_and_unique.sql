-- PetMi Hub — recebível vinculado à comanda; relaxa unicidade por origem quando há comanda_id.
-- Pré-requisitos: create_hub_financial_core.sql, create_hub_comandas.sql.

ALTER TABLE public.hub_receivables
  ADD COLUMN IF NOT EXISTS comanda_id uuid REFERENCES public.hub_comandas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_receivables_comanda
  ON public.hub_receivables (comanda_id)
  WHERE comanda_id IS NOT NULL AND deleted_at IS NULL;

DROP INDEX IF EXISTS public.uniq_hub_receivables_active_source;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_receivables_active_source_legacy
  ON public.hub_receivables (clinic_id, source_type, source_id)
  WHERE deleted_at IS NULL AND status <> 'cancelled' AND comanda_id IS NULL;

NOTIFY pgrst, 'reload schema';
