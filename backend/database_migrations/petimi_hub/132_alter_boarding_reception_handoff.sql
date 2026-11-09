-- PetMi Hub — Hotel/Creche na Operação da Recepção.
-- Estadia ganha preparação/liberação; recepção ganha saida_prevista e fecha o check-out.
-- Pré-requisitos: 051, 052, 121.

-- ─── Status da estadia ─────────────────────────────────────────────────────

ALTER TABLE public.hub_boarding_reservations
  DROP CONSTRAINT IF EXISTS hub_boarding_reservations_status_check;

ALTER TABLE public.hub_boarding_reservations
  ADD CONSTRAINT hub_boarding_reservations_status_check CHECK (status IN (
    'reserved',
    'checked_in',
    'checkout_preparing',
    'ready_for_handoff',
    'checked_out',
    'cancelled',
    'no_show'
  ));

ALTER TABLE public.hub_boarding_reservations
  ADD COLUMN IF NOT EXISTS handoff_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_ready_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_boarding_reservations.handoff_ready_at IS
  'Quando o hotel/creche liberou o pet para a recepção entregar ou embarcar.';
COMMENT ON COLUMN public.hub_boarding_reservations.handoff_ready_by_staff_id IS
  'Staff que liberou o pet para a Operação da Recepção.';

-- ─── Kind de handoff ───────────────────────────────────────────────────────

ALTER TABLE public.hub_reception_handoffs
  DROP CONSTRAINT IF EXISTS hub_reception_handoffs_kind_check;

ALTER TABLE public.hub_reception_handoffs
  ADD CONSTRAINT hub_reception_handoffs_kind_check CHECK (kind IN (
    'chegada',
    'autorizar_extra',
    'encaminhar',
    'retirada_balcao',
    'embarque',
    'lt_falha',
    'saida_prevista'
  ));

-- ─── Configuração da unidade ───────────────────────────────────────────────

ALTER TABLE public.hub_unit_boarding_settings
  ADD COLUMN IF NOT EXISTS block_exit_if_charge_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_unit_boarding_settings.block_exit_if_charge_pending IS
  'Quando true, bloqueia liberar para recepção e Entreguei/Embarquei se houver comanda em aberto.';

NOTIFY pgrst, 'reload schema';
