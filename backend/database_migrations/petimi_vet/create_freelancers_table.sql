-- ========================================
-- Migration: Criar tabela freelancers
-- Date: 2025-01-30
-- Description: Cria tabela freelancers com campos necessários para cadastro
-- ========================================

-- Criar tabela freelancers
CREATE TABLE IF NOT EXISTS freelancers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_type text CHECK (document_type IN ('CPF', 'CNPJ')),
  document_number text UNIQUE NOT NULL,
  address text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  city text,
  state text,
  bio text,
  photo_url text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  onboarding_completed boolean DEFAULT false,
  approval_status text DEFAULT 'pending' 
    CHECK (approval_status IN ('pending', 'pending_approval', 'approved', 'rejected', 'pending_review')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamp with time zone,
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_freelancers_email ON freelancers(email);
CREATE INDEX IF NOT EXISTS idx_freelancers_document_number ON freelancers(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_freelancers_status ON freelancers(status);
CREATE INDEX IF NOT EXISTS idx_freelancers_onboarding_completed ON freelancers(onboarding_completed) WHERE onboarding_completed = false;
CREATE INDEX IF NOT EXISTS idx_freelancers_approval_status ON freelancers(approval_status) WHERE approval_status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_freelancers_approved_by ON freelancers(approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_freelancers_reviewed_by ON freelancers(reviewed_by) WHERE reviewed_by IS NOT NULL;

-- Criar trigger para atualizar updated_at automaticamente
DROP TRIGGER IF EXISTS update_freelancers_updated_at ON freelancers;
CREATE TRIGGER update_freelancers_updated_at
  BEFORE UPDATE ON freelancers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime();

-- Comentários nas colunas
COMMENT ON TABLE freelancers IS 'Tabela de freelancers cadastrados no sistema';
COMMENT ON COLUMN freelancers.id IS 'ID do freelancer (mesmo ID do auth.users)';
COMMENT ON COLUMN freelancers.name IS 'Nome completo do freelancer';
COMMENT ON COLUMN freelancers.document_type IS 'Tipo de documento: CPF ou CNPJ';
COMMENT ON COLUMN freelancers.document_number IS 'Número do documento (CPF ou CNPJ) sem formatação';
COMMENT ON COLUMN freelancers.address IS 'Endereço completo do freelancer';
COMMENT ON COLUMN freelancers.email IS 'Email do freelancer (único)';
COMMENT ON COLUMN freelancers.status IS 'Status do freelancer: active ou inactive';
COMMENT ON COLUMN freelancers.onboarding_completed IS 'Indica se o freelancer completou o onboarding';
COMMENT ON COLUMN freelancers.approval_status IS 'Status de aprovação: pending (aguardando onboarding), pending_approval (aguardando aprovação admin), approved (aprovado), rejected (rejeitado), pending_review (aguardando ajustes)';
COMMENT ON COLUMN freelancers.approved_by IS 'ID do admin que aprovou o freelancer';
COMMENT ON COLUMN freelancers.approved_at IS 'Data e hora da aprovação';
COMMENT ON COLUMN freelancers.rejection_reason IS 'Motivo da rejeição (se aplicável)';
COMMENT ON COLUMN freelancers.reviewed_by IS 'ID do admin que revisou o freelancer';
COMMENT ON COLUMN freelancers.reviewed_at IS 'Data e hora da revisão';

-- Verificação de sucesso
SELECT 'Migration create_freelancers_table.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'freelancers') as table_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'id') as id_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'document_type') as document_type_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'document_number') as document_number_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'address') as address_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'onboarding_completed') as onboarding_completed_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'approval_status') as approval_status_exists;

