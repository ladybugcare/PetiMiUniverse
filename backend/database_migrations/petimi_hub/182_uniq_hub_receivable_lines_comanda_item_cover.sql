-- PetMi Hub — P2-05: no máximo uma cobertura ativa por item de comanda.
-- Checkout grava source_type=manual + source_id aleatório; a unicidade por origem
-- (040) não impede dois checkouts simultâneos dos mesmos itens.
-- covers_comanda_item espelha receivableBillsComandaItem (reissue libera; void_sale/refunded mantêm).
-- Pré-requisitos: 041_alter_hub_receivable_lines_comanda.sql, 174_alter_hub_receivables_cancel_rebill.sql.

ALTER TABLE public.hub_receivable_lines
  ADD COLUMN IF NOT EXISTS covers_comanda_item boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hub_receivable_lines.covers_comanda_item IS
  'true = linha ainda cobre o item da comanda (não entra em open_item_ids). false após cancel_rebill/reissue.';

-- Alinha flag ao estado atual do recebível (reissue = cancelled sem devolução e cancel_rebill ≠ false).
UPDATE public.hub_receivable_lines l
SET covers_comanda_item = NOT (
  r.status = 'cancelled'
  AND COALESCE(r.returned_amount, 0) <= 0.009
  AND r.cancel_rebill IS DISTINCT FROM false
)
FROM public.hub_receivables r
WHERE r.id = l.receivable_id
  AND l.covers_comanda_item IS DISTINCT FROM NOT (
    r.status = 'cancelled'
    AND COALESCE(r.returned_amount, 0) <= 0.009
    AND r.cancel_rebill IS DISTINCT FROM false
  );

-- Duplicatas raras (corrida pré-índice): mantém a linha do recebível mais antigo cobrindo.
WITH ranked AS (
  SELECT
    l.id,
    ROW_NUMBER() OVER (
      PARTITION BY l.comanda_item_id
      ORDER BY r.created_at ASC NULLS LAST, l.id ASC
    ) AS rn
  FROM public.hub_receivable_lines l
  JOIN public.hub_receivables r ON r.id = l.receivable_id
  WHERE l.comanda_item_id IS NOT NULL
    AND l.covers_comanda_item = true
)
UPDATE public.hub_receivable_lines l
SET covers_comanda_item = false
FROM ranked r
WHERE l.id = r.id
  AND r.rn > 1
  AND l.covers_comanda_item = true;

CREATE OR REPLACE FUNCTION public.hub_sync_receivable_line_covers_comanda_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  covers boolean;
BEGIN
  covers := NOT (
    NEW.status = 'cancelled'
    AND COALESCE(NEW.returned_amount, 0) <= 0.009
    AND NEW.cancel_rebill IS DISTINCT FROM false
  );
  UPDATE public.hub_receivable_lines
  SET covers_comanda_item = covers
  WHERE receivable_id = NEW.id
    AND covers_comanda_item IS DISTINCT FROM covers;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hub_receivables_sync_line_covers ON public.hub_receivables;
CREATE TRIGGER trg_hub_receivables_sync_line_covers
  AFTER INSERT OR UPDATE OF status, returned_amount, cancel_rebill
  ON public.hub_receivables
  FOR EACH ROW
  EXECUTE FUNCTION public.hub_sync_receivable_line_covers_comanda_item();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_receivable_lines_comanda_item_cover
  ON public.hub_receivable_lines (comanda_item_id)
  WHERE comanda_item_id IS NOT NULL AND covers_comanda_item = true;

COMMENT ON INDEX public.uniq_hub_receivable_lines_comanda_item_cover IS
  'P2-05: um item de comanda só pode ter uma linha cobrindo (anti-corrida de checkout).';

-- Origem sem comanda: refunded/cancelled não bloqueiam nova cobrança legítima.
DROP INDEX IF EXISTS public.uniq_hub_receivables_active_source_legacy;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_receivables_active_source_legacy
  ON public.hub_receivables (clinic_id, source_type, source_id)
  WHERE deleted_at IS NULL
    AND comanda_id IS NULL
    AND status IN ('pending', 'partially_paid', 'paid');

COMMENT ON INDEX public.uniq_hub_receivables_active_source_legacy IS
  'P2-05: unicidade de origem ativa (sem comanda); exclui cancelled e refunded.';

NOTIFY pgrst, 'reload schema';
