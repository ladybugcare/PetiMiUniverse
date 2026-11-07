-- PetMi Hub — Hotel & Creche: fotos da estadia (Fase 10).
-- Caminho no storage: {clinicId}/{reservationId}/{timestamp}-{rand}.{ext}
-- Pré-requisitos: 125_create_hub_boarding_tasks.sql, 126_create_hub_boarding_incidents_belongings.sql.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hub-boarding-media',
  'hub-boarding-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.hub_boarding_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  hub_boarding_task_id uuid REFERENCES public.hub_boarding_tasks(id) ON DELETE SET NULL,
  hub_boarding_incident_id uuid REFERENCES public.hub_boarding_incidents(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  url text NOT NULL,
  mime_type text,
  caption text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_media_reservation
  ON public.hub_boarding_media (hub_boarding_reservation_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_boarding_media IS
  'Fotos da estadia, opcionalmente ligadas a uma tarefa ou intercorrência. Aparecem na linha do tempo e no relatório ao tutor.';

NOTIFY pgrst, 'reload schema';
