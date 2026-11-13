-- PetMi Hub P0.5 — troco estruturado em hub_payments.
-- amount = valor efetivo (receita). tendered_amount = valor entregue. change_amount = troco.
-- Fechamento de caixa continua somando apenas amount.

ALTER TABLE public.hub_payments
  ADD COLUMN IF NOT EXISTS tendered_amount numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS change_amount numeric(12, 2) NULL;

COMMENT ON COLUMN public.hub_payments.tendered_amount IS
  'Valor entregue pelo cliente (dinheiro). NULL = não informado / não-cash.';
COMMENT ON COLUMN public.hub_payments.change_amount IS
  'Troco devolvido (tendered_amount - amount). Não é receita.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_payments_tendered_change_check'
  ) THEN
    ALTER TABLE public.hub_payments
      ADD CONSTRAINT hub_payments_tendered_change_check
      CHECK (
        (tendered_amount IS NULL AND change_amount IS NULL)
        OR (
          payment_method = 'cash'
          AND tendered_amount IS NOT NULL
          AND change_amount IS NOT NULL
          AND tendered_amount >= 0
          AND change_amount >= 0
          AND tendered_amount + 0.02 >= amount
          AND abs((tendered_amount - amount) - change_amount) <= 0.02
        )
      );
  END IF;
END $$;

-- Backfill best-effort a partir de notes: "Troco R$ X (recebido R$ Y)"
DO $$
DECLARE
  r RECORD;
  change_raw text;
  tendered_raw text;
  change_n numeric;
  tendered_n numeric;
BEGIN
  FOR r IN
    SELECT id, notes, amount
    FROM public.hub_payments
    WHERE payment_method = 'cash'
      AND tendered_amount IS NULL
      AND notes IS NOT NULL
      AND notes LIKE '%Troco R$%'
  LOOP
    change_raw := substring(r.notes from 'Troco R\$ ([0-9]+[.,]?[0-9]*)');
    tendered_raw := substring(r.notes from 'recebido R\$ ([0-9]+[.,]?[0-9]*)');
    IF change_raw IS NULL OR tendered_raw IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      change_n := replace(change_raw, ',', '.')::numeric;
      tendered_n := replace(tendered_raw, ',', '.')::numeric;
      IF tendered_n + 0.02 >= r.amount AND abs((tendered_n - r.amount) - change_n) <= 0.02 THEN
        UPDATE public.hub_payments
        SET tendered_amount = round(tendered_n, 2),
            change_amount = round(change_n, 2)
        WHERE id = r.id;
      END IF;
    EXCEPTION WHEN others THEN
      NULL; -- best-effort
    END;
  END LOOP;
END $$;
