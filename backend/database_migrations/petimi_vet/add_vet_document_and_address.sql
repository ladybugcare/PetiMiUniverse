-- ========================================
-- Migration: Adicionar campos document_type, document_number e address à tabela vets
-- Date: 2025-01-30
-- Description: Adiciona campos para tipo de documento (CPF/CNPJ), número do documento e endereço
-- ========================================

-- Adicionar coluna document_type se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS document_type text CHECK (document_type IN ('CPF', 'CNPJ'));

-- Adicionar coluna document_number se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS document_number text;

-- Criar índice único para document_number (permitindo NULL para compatibilidade)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vets_document_number ON vets(document_number) WHERE document_number IS NOT NULL;

-- Adicionar coluna address se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS address text;

-- Comentários nas colunas
COMMENT ON COLUMN vets.document_type IS 'Tipo de documento: CPF ou CNPJ';
COMMENT ON COLUMN vets.document_number IS 'Número do documento (CPF ou CNPJ) sem formatação';
COMMENT ON COLUMN vets.address IS 'Endereço completo do veterinário';

-- Verificação de sucesso
SELECT 'Migration add_vet_document_and_address.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'document_type') as document_type_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'document_number') as document_number_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'address') as address_exists;

