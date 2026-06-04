-- PetMi Hub — pacotes pré-pagos e assinaturas (Fase 6; catálogo + saldo + agendador).
-- Pré-requisitos: clinics, hub_guardians, hub_pets, hub_service_types.

CREATE TABLE IF NOT EXISTS public.hub_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  sessions_total integer NOT NULL CHECK (sessions_total > 0),
  price numeric(14, 2) NOT NULL CHECK (price >= 0),
  validity_days integer CHECK (validity_days IS NULL OR validity_days > 0),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hub_customer_package_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.hub_guardians(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  package_id uuid NOT NULL REFERENCES public.hub_packages(id) ON DELETE CASCADE,
  sessions_remaining integer NOT NULL CHECK (sessions_remaining >= 0),
  purchased_receivable_id uuid REFERENCES public.hub_receivables(id) ON DELETE SET NULL,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_customer_package_balances_guardian
  ON public.hub_customer_package_balances (clinic_id, guardian_id);

CREATE TABLE IF NOT EXISTS public.hub_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.hub_guardians(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  next_run_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_subscriptions_clinic_next
  ON public.hub_subscriptions (clinic_id, next_run_date)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS update_hub_packages_updated_at ON public.hub_packages;
CREATE TRIGGER update_hub_packages_updated_at
  BEFORE UPDATE ON public.hub_packages
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

DROP TRIGGER IF EXISTS update_hub_subscriptions_updated_at ON public.hub_subscriptions;
CREATE TRIGGER update_hub_subscriptions_updated_at
  BEFORE UPDATE ON public.hub_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_packages IS 'Definição de pacote pré-pago (N sessões de um serviço).';
COMMENT ON TABLE public.hub_customer_package_balances IS 'Saldo de sessões comprado por tutor/pet.';
COMMENT ON TABLE public.hub_subscriptions IS 'Assinatura/recorrência (gera comanda/recebível por ciclo).';

NOTIFY pgrst, 'reload schema';
