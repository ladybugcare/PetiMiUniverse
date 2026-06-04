-- PetMi Hub — prospects (contatos mínimos) e orçamentos (quotes) sem tutor até conversão.
-- Pré-requisitos: `clinics`, `units`, `hub_guardians`, `hub_service_types`, função `moddatetime`.
-- Segurança: isolamento por `clinic_id` na API (service role), como `hub_guardians` / `hub_appointments`.

CREATE TABLE IF NOT EXISTS public.hub_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  -- CPF: normalizar para dígitos na API; armazenamento como texto.
  tax_id text NOT NULL,
  phone text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_prospects_clinic_active
  ON public.hub_prospects (clinic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_prospects_clinic_tax
  ON public.hub_prospects (clinic_id, tax_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_prospects IS 'Contato comercial mínimo para orçamentos; não substitui hub_guardians até conversão.';

DROP TRIGGER IF EXISTS update_hub_prospects_updated_at ON public.hub_prospects;
CREATE TRIGGER update_hub_prospects_updated_at
  BEFORE UPDATE ON public.hub_prospects
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TABLE IF NOT EXISTS public.hub_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES public.hub_prospects(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'expired', 'cancelled')),
  notes text,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  sent_at timestamptz,
  expires_at timestamptz,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_quotes_clinic ON public.hub_quotes (clinic_id);
CREATE INDEX IF NOT EXISTS idx_hub_quotes_clinic_status ON public.hub_quotes (clinic_id, status);

COMMENT ON TABLE public.hub_quotes IS 'Orçamento; validade após envio (sent_at + 7 dias em expires_at).';

DROP TRIGGER IF EXISTS update_hub_quotes_updated_at ON public.hub_quotes;
CREATE TRIGGER update_hub_quotes_updated_at
  BEFORE UPDATE ON public.hub_quotes
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TABLE IF NOT EXISTS public.hub_quote_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.hub_quotes(id) ON DELETE CASCADE,
  display_name text,
  species text NOT NULL,
  breed text NOT NULL,
  size_tier text NOT NULL CHECK (size_tier IN ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_quote_pets_quote ON public.hub_quote_pets (quote_id);

CREATE TABLE IF NOT EXISTS public.hub_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.hub_quotes(id) ON DELETE CASCADE,
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  description text,
  quantity numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_quote_lines_quote ON public.hub_quote_lines (quote_id);
