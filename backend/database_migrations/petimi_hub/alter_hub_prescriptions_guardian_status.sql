-- Item 59: tutor na prescrição + status issued após emissão validável
ALTER TABLE public.hub_prescriptions
  ADD COLUMN IF NOT EXISTS guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL;

ALTER TABLE public.hub_prescriptions DROP CONSTRAINT IF EXISTS hub_prescriptions_status_check;
ALTER TABLE public.hub_prescriptions ADD CONSTRAINT hub_prescriptions_status_check
  CHECK (status IN ('draft', 'active', 'issued', 'cancelled'));

COMMENT ON COLUMN public.hub_prescriptions.guardian_id IS 'Tutor no momento da prescrição (herdado do atendimento).';

NOTIFY pgrst, 'reload schema';
