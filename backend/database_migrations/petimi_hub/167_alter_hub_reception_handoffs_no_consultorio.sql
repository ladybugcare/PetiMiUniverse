-- Kind informativo: pet já no consultório (encaixe / atendimento / admissão espelhada).
-- Sem ação de Chegada — só visibilidade para a recepção.

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
    'saida_prevista',
    'no_consultorio'
  ));

NOTIFY pgrst, 'reload schema';
