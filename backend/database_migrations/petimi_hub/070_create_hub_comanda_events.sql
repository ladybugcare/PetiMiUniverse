-- Timeline de alterações na comanda (itens adicionados, removidos, alterados).
-- Pré-requisito: 039_create_hub_comandas.sql

CREATE TABLE IF NOT EXISTS public.hub_comanda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  comanda_id uuid NOT NULL REFERENCES public.hub_comandas(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('item_added', 'item_removed', 'item_updated', 'items_synced')),
  title text NOT NULL,
  body text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  actor_user_id uuid NULL,
  edit_context text NULL CHECK (edit_context IS NULL OR edit_context IN ('caixa', 'financeiro')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_comanda_events_comanda_created
  ON public.hub_comanda_events (comanda_id, created_at ASC);

COMMENT ON TABLE public.hub_comanda_events IS 'Histórico de alterações de itens e sincronizações na comanda (timeline Caixa/Financeiro).';

NOTIFY pgrst, 'reload schema';
