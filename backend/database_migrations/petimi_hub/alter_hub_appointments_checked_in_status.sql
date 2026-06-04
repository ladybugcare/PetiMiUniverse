-- PetMi Hub — novo status 'checked_in': paciente chegou à recepção e aguarda na fila operacional.
-- Pré-requisitos: create_hub_appointments.sql.
--
-- Máquina de estados da agenda clínica:
--   pending_confirm → confirmed → checked_in → in_progress → done
--                                             ↘ cancelled
-- confirmed   : slot futuro confirmado na agenda.
-- checked_in  : paciente presente na recepção; entrada na fila antes de o profissional iniciar.
-- in_progress : encounter criado (profissional iniciou o atendimento).

ALTER TABLE public.hub_appointments DROP CONSTRAINT IF EXISTS hub_appointments_status_check;

ALTER TABLE public.hub_appointments ADD CONSTRAINT hub_appointments_status_check CHECK (status IN (
  'pending_confirm',
  'confirmed',
  'checked_in',
  'in_progress',
  'done',
  'cancelled',
  'paid'
));

COMMENT ON COLUMN public.hub_appointments.status IS
  'pending_confirm: aguardando confirmação; confirmed: confirmado na agenda; checked_in: paciente chegou e aguarda na fila; in_progress: atendimento em curso (encounter criado); done: finalizado; cancelled: cancelado; paid: pago.';

NOTIFY pgrst, 'reload schema';
