-- PetMi Hub — consumo de sessões de pacote (auditoria).
-- Pré-requisitos: 076_alter_hub_customer_package_balances_v2.sql, 039a_create_hub_comanda_items.sql.

CREATE TABLE IF NOT EXISTS public.hub_package_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  balance_id uuid NOT NULL REFERENCES public.hub_customer_package_balances(id) ON DELETE RESTRICT,
  comanda_item_id uuid NOT NULL REFERENCES public.hub_comanda_items(id) ON DELETE CASCADE,
  appointment_service_id uuid REFERENCES public.hub_appointment_services(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  reversed_at timestamptz,
  reversed_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_package_redemptions_comanda_item
  ON public.hub_package_redemptions (comanda_item_id)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_package_redemptions_balance
  ON public.hub_package_redemptions (balance_id, redeemed_at);

COMMENT ON TABLE public.hub_package_redemptions IS 'Debito de sessão de pacote na comanda de atendimento; reversed_at quando checkout cancelado.';

NOTIFY pgrst, 'reload schema';
