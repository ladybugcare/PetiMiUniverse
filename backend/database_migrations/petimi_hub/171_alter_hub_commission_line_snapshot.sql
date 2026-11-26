-- PetMi Hub — snapshot imutável de comissão por linha de recebível + autoria de venda em item de comanda.
-- Pré-requisitos: 038/160 (hub_commission_rules), 039a (hub_comanda_items), 035/041/042 (hub_receivable_lines).

-- Autoria da venda de produto na origem operacional (antes do checkout / leave_pending / auto-close).
ALTER TABLE public.hub_comanda_items
  ADD COLUMN IF NOT EXISTS sold_by_staff_id uuid
    REFERENCES public.hub_staff_members(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_hub_comanda_items_sold_by_staff
  ON public.hub_comanda_items (sold_by_staff_id)
  WHERE sold_by_staff_id IS NOT NULL;

COMMENT ON COLUMN public.hub_comanda_items.sold_by_staff_id IS
  'Profissional responsável pela venda do produto (autoria). Nunca opener do caixa. Imutável após handoff financeiro.';

-- Snapshot de apuração na linha financeira (somente novos inserts após o deploy preenchem).
ALTER TABLE public.hub_receivable_lines
  ADD COLUMN IF NOT EXISTS commission_staff_member_id uuid
    REFERENCES public.hub_staff_members(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS commission_staff_source text
    CHECK (
      commission_staff_source IS NULL
      OR commission_staff_source IN ('service_executor', 'sale_author', 'none')
    ),
  ADD COLUMN IF NOT EXISTS commission_attributed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_rule_id uuid
    REFERENCES public.hub_commission_rules(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS commission_rule_basis text
    CHECK (
      commission_rule_basis IS NULL
      OR commission_rule_basis IN ('percent_of_sale', 'fixed_per_sale')
    ),
  ADD COLUMN IF NOT EXISTS commission_rule_rate numeric(14, 4)
    CHECK (commission_rule_rate IS NULL OR commission_rule_rate >= 0),
  ADD COLUMN IF NOT EXISTS commission_basis_amount numeric(14, 2)
    CHECK (commission_basis_amount IS NULL OR commission_basis_amount >= 0),
  ADD COLUMN IF NOT EXISTS commission_original_amount numeric(14, 2)
    CHECK (commission_original_amount IS NULL OR commission_original_amount >= 0),
  ADD COLUMN IF NOT EXISTS commission_accrued_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hub_receivable_lines_commission_staff
  ON public.hub_receivable_lines (clinic_id, commission_staff_member_id)
  WHERE commission_accrued_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_receivable_lines_commission_accrued
  ON public.hub_receivable_lines (commission_accrued_at)
  WHERE commission_accrued_at IS NOT NULL;

COMMENT ON COLUMN public.hub_receivable_lines.commission_staff_member_id IS
  'Snapshot: profissional atribuído (null + attributed_at = Sem profissional processado).';
COMMENT ON COLUMN public.hub_receivable_lines.commission_staff_source IS
  'service_executor | sale_author | none';
COMMENT ON COLUMN public.hub_receivable_lines.commission_attributed_at IS
  'Momento da atribuição de staff. NULL = linha pré-implante (fora do regime).';
COMMENT ON COLUMN public.hub_receivable_lines.commission_rule_id IS
  'Snapshot da regra aplicada; soft-delete da regra não apaga o snapshot denormalizado.';
COMMENT ON COLUMN public.hub_receivable_lines.commission_rule_basis IS
  'Cópia imutável: percent_of_sale | fixed_per_sale';
COMMENT ON COLUMN public.hub_receivable_lines.commission_rule_rate IS
  'Cópia imutável da taxa/% ou valor fixo (inclui 0).';
COMMENT ON COLUMN public.hub_receivable_lines.commission_basis_amount IS
  'Base líquida comercial usada na apuração.';
COMMENT ON COLUMN public.hub_receivable_lines.commission_original_amount IS
  'Comissão original apurada (≥ 0). Ajustes de devolução não mutam este valor.';
COMMENT ON COLUMN public.hub_receivable_lines.commission_accrued_at IS
  'Momento da apuração. NULL = fora do novo regime (sem comissão no relatório).';

NOTIFY pgrst, 'reload schema';
