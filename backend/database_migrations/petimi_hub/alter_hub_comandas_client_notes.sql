-- PetMi Hub — observação visível ao cliente na comanda (PDF e link público).
-- Pré-requisito: create_hub_comandas.sql

ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS client_notes text;

COMMENT ON COLUMN public.hub_comandas.client_notes IS 'Observação visível ao cliente no PDF e link público (≠ notes interno).';
