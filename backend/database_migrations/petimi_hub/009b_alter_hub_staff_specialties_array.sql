-- PetMi Hub — especialidades da equipe como text[] (alinhado a vets.specialties no PetMiVet).
-- Converte legado: JSON em text, lista separada por vírgula ou valor único livre.
-- Idempotente: se a coluna já for text[], não altera o tipo.
--
-- Nota: PostgreSQL não permite subquery no USING de ALTER TYPE; usamos função auxiliar.

CREATE OR REPLACE FUNCTION public.hub_staff_parse_specialties_text(raw text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text[];
  trimmed text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN '{}'::text[];
  END IF;

  trimmed := btrim(raw);

  IF left(trimmed, 1) = '[' THEN
    BEGIN
      SELECT COALESCE(array_agg(value ORDER BY ord), '{}'::text[])
      INTO result
      FROM json_array_elements_text(trimmed::json) WITH ORDINALITY AS t(value, ord)
      WHERE btrim(value) <> '';
    EXCEPTION
      WHEN OTHERS THEN
        result := '{}'::text[];
    END;
    RETURN COALESCE(result, '{}'::text[]);
  END IF;

  SELECT COALESCE(array_agg(btrim(part)), '{}'::text[])
  INTO result
  FROM unnest(string_to_array(trimmed, ',')) AS part
  WHERE btrim(part) <> '';

  RETURN COALESCE(result, '{}'::text[]);
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hub_staff_members'
      AND column_name = 'specialties'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE public.hub_staff_members
      ALTER COLUMN specialties DROP DEFAULT;

    ALTER TABLE public.hub_staff_members
      ALTER COLUMN specialties TYPE text[]
      USING public.hub_staff_parse_specialties_text(specialties);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.hub_staff_parse_specialties_text(text);

ALTER TABLE public.hub_staff_members
  ALTER COLUMN specialties SET DEFAULT '{}'::text[];

UPDATE public.hub_staff_members
SET specialties = '{}'::text[]
WHERE specialties IS NULL;

ALTER TABLE public.hub_staff_members
  ALTER COLUMN specialties SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_staff_members_specialties
  ON public.hub_staff_members USING GIN (specialties);

COMMENT ON COLUMN public.hub_staff_members.specialties IS
  'IDs (uuid) do catálogo public.specialties e/ou nomes livres — mesmo formato de vets.specialties.';
