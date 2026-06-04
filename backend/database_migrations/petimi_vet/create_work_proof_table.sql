-- ========================================
-- Migration: Criar tabela work_proof
-- Date: 2025-11-18
-- Description: Tabela para armazenar prova de trabalho (check-in, check-out, relatórios)
-- ========================================

-- Criar tabela work_proof
CREATE TABLE IF NOT EXISTS work_proof (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES demand_applications(id) ON DELETE CASCADE,
  checkin_time timestamp with time zone,
  checkout_time timestamp with time zone,
  location_checkin jsonb, -- {lat: number, lng: number, address?: string}
  location_checkout jsonb, -- {lat: number, lng: number, address?: string}
  report_text text,
  attachments text[], -- Array de URLs de arquivos anexados
  clinic_signature jsonb, -- {signed_by: uuid, signed_at: timestamp, signature_data?: string}
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Garantir que checkin_time existe antes de checkout_time
  CONSTRAINT work_proof_checkout_after_checkin CHECK (
    checkout_time IS NULL OR checkin_time IS NOT NULL
  ),
  
  -- Garantir que checkout_time é após checkin_time
  CONSTRAINT work_proof_checkout_after_checkin_time CHECK (
    checkout_time IS NULL OR checkin_time IS NULL OR checkout_time >= checkin_time
  )
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_work_proof_application_id ON work_proof(application_id);
CREATE INDEX IF NOT EXISTS idx_work_proof_checkin_time ON work_proof(checkin_time);
CREATE INDEX IF NOT EXISTS idx_work_proof_checkout_time ON work_proof(checkout_time);
CREATE INDEX IF NOT EXISTS idx_work_proof_created_at ON work_proof(created_at);

-- Comentários
COMMENT ON TABLE work_proof IS 'Prova de trabalho: check-in, check-out e relatórios de plantões';
COMMENT ON COLUMN work_proof.location_checkin IS 'Geolocalização do check-in (JSONB com lat, lng, address)';
COMMENT ON COLUMN work_proof.location_checkout IS 'Geolocalização do check-out (JSONB com lat, lng, address)';
COMMENT ON COLUMN work_proof.attachments IS 'Array de URLs de arquivos anexados ao relatório (fotos, PDFs, etc)';
COMMENT ON COLUMN work_proof.clinic_signature IS 'Assinatura digital da clínica confirmando o trabalho (JSONB)';

-- Mensagem de sucesso
SELECT 'Migration create_work_proof_table.sql concluída com sucesso!' as status;

