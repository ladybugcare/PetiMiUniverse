-- Item 61: auditoria de documentos de receita (created, viewed, pdf_downloaded, revoked)
CREATE TABLE IF NOT EXISTS public.hub_prescription_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.hub_prescription_documents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'viewed', 'pdf_downloaded', 'revoked')),
  actor_user_id uuid NULL,
  actor_ip inet NULL,
  actor_user_agent text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_prescription_document_events_document
  ON public.hub_prescription_document_events (document_id, created_at DESC);

COMMENT ON TABLE public.hub_prescription_document_events IS 'Auditoria de emissão, visualização, download e revogação de receitas validáveis.';

NOTIFY pgrst, 'reload schema';
