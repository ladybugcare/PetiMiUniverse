-- PetMi Hub — base de comissão fixed_per_unit (valor fixo × quantidade da linha).
-- Pré-requisitos: 038 (hub_commission_rules), 171 (commission_rule_basis no snapshot).

-- Regras ativas / futuras
ALTER TABLE public.hub_commission_rules
  DROP CONSTRAINT IF EXISTS hub_commission_rules_basis_check;

ALTER TABLE public.hub_commission_rules
  ADD CONSTRAINT hub_commission_rules_basis_check CHECK (
    basis IN ('percent_of_sale', 'fixed_per_sale', 'fixed_per_unit')
  );

COMMENT ON COLUMN public.hub_commission_rules.basis IS
  'percent_of_sale = % da base líquida da linha; fixed_per_sale = valor fixo por linha; fixed_per_unit = valor fixo × quantidade (teto = base líquida).';

-- Snapshot imutável nas linhas já apuradas / novas
ALTER TABLE public.hub_receivable_lines
  DROP CONSTRAINT IF EXISTS hub_receivable_lines_commission_rule_basis_check;

ALTER TABLE public.hub_receivable_lines
  ADD CONSTRAINT hub_receivable_lines_commission_rule_basis_check CHECK (
    commission_rule_basis IS NULL
    OR commission_rule_basis IN ('percent_of_sale', 'fixed_per_sale', 'fixed_per_unit')
  );

COMMENT ON COLUMN public.hub_receivable_lines.commission_rule_basis IS
  'Cópia imutável: percent_of_sale | fixed_per_sale | fixed_per_unit';

NOTIFY pgrst, 'reload schema';
