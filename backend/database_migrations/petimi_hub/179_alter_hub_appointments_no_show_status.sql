-- PetMi Hub — status `no_show` (falta) na agenda de banho/consulta/clínica.
-- Pré-requisitos: `048_alter_hub_appointments_checked_in_status.sql`.
--
-- Máquina de estados (acrescenta falta explícita):
--   pending_confirm → confirmed → checked_in → in_progress → done
--                                             ↘ cancelled
--                                             ↘ no_show
-- no_show: pet não compareceu; fora do caixa do dia e da fatura em série.

ALTER TABLE public.hub_appointments DROP CONSTRAINT IF EXISTS hub_appointments_status_check;

ALTER TABLE public.hub_appointments ADD CONSTRAINT hub_appointments_status_check CHECK (status IN (
  'pending_confirm',
  'confirmed',
  'checked_in',
  'in_progress',
  'done',
  'cancelled',
  'paid',
  'no_show'
));

COMMENT ON COLUMN public.hub_appointments.status IS
  'pending_confirm: aguardando confirmação; confirmed: confirmado na agenda; checked_in: paciente chegou e aguarda na fila; in_progress: atendimento em curso; done: finalizado; cancelled: cancelado; paid: pago; no_show: falta (não compareceu).';

NOTIFY pgrst, 'reload schema';
