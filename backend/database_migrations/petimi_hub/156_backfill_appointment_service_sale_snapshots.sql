-- PetMi Hub — backfill de sale_amount_applied nulo + reparo de comandas abertas zeradas.
-- Idempotente. Corrige linhas de seed/legado sem snapshot e itens de comanda já copiados como 0.

-- 1) Snapshot a partir do catálogo (só onde ainda está NULL).
UPDATE public.hub_appointment_services s
SET
  sale_amount_applied = COALESCE(st.sale_amount, 0),
  cost_amount_applied = COALESCE(s.cost_amount_applied, st.cost_amount, 0),
  pricing_source = COALESCE(s.pricing_source, 'catalog')
FROM public.hub_service_types st
WHERE s.hub_service_type_id = st.id
  AND s.sale_amount_applied IS NULL;

-- 2) Itens de comanda aberta que herdaram 0 de snapshot nulo (sem pacote / cobertura).
UPDATE public.hub_comanda_items i
SET
  unit_amount = s.sale_amount_applied,
  line_total = ROUND(
    (COALESCE(i.quantity, 1) * s.sale_amount_applied) - COALESCE(i.discount_amount, 0),
    2
  )
FROM public.hub_appointment_services s,
     public.hub_comandas c
WHERE i.origin_type = 'appointment_service'
  AND i.origin_id = s.id
  AND c.id = i.comanda_id
  AND c.clinic_id = i.clinic_id
  AND i.package_balance_id IS NULL
  AND COALESCE(i.unit_amount, 0) = 0
  AND s.sale_amount_applied > 0
  AND c.deleted_at IS NULL
  AND c.status = 'aberta'
  AND COALESCE(c.financial_status, 'open') IN ('open', 'partial');

-- 3) Recalcula totais das comandas afetadas (itens abertos).
WITH affected AS (
  SELECT DISTINCT i.comanda_id, i.clinic_id
  FROM public.hub_comanda_items i
  JOIN public.hub_comandas c ON c.id = i.comanda_id
  WHERE i.origin_type = 'appointment_service'
    AND i.package_balance_id IS NULL
    AND c.deleted_at IS NULL
    AND c.status = 'aberta'
    AND COALESCE(c.financial_status, 'open') IN ('open', 'partial')
),
sums AS (
  SELECT
    a.comanda_id,
    a.clinic_id,
    ROUND(COALESCE(SUM(i.line_total), 0), 2) AS subtotal
  FROM affected a
  JOIN public.hub_comanda_items i ON i.comanda_id = a.comanda_id
  GROUP BY a.comanda_id, a.clinic_id
)
UPDATE public.hub_comandas c
SET
  subtotal_amount = s.subtotal,
  total_amount = GREATEST(0, ROUND(s.subtotal - COALESCE(c.discount_amount, 0), 2)),
  updated_at = now()
FROM sums s
WHERE c.id = s.comanda_id
  AND c.clinic_id = s.clinic_id;
