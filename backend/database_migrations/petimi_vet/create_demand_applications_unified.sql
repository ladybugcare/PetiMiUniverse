-- ========================================
-- Migration: Criar tabela demand_applications unificada
-- Date: 2025-11-18
-- Description: Cria tabela unificada para aplicações de demandas, substituindo
--              applications e position_applications para simplificar o lifecycle
-- ========================================

-- Criar tabela demand_applications
CREATE TABLE IF NOT EXISTS demand_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  vet_id uuid REFERENCES vets(id) ON DELETE CASCADE,
  freelancer_id uuid REFERENCES freelancers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN (
    'invited',           -- Convidado pela clínica
    'applied',           -- Candidatou-se
    'approved',          -- Aprovado pela clínica
    'rejected',          -- Rejeitado pela clínica
    'rejected_by_vet',   -- Recusou convite ou cancelou
    'check_in',          -- Fez check-in
    'check_out',         -- Fez check-out
    'report_sent',       -- Enviou relatório
    'report_approved',   -- Relatório aprovado pela clínica
    'canceled_by_vet'    -- Cancelado pelo vet
  )),
  message text,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamp with time zone,
  position_id uuid REFERENCES demand_positions(id) ON DELETE SET NULL, -- Opcional, para compatibilidade com demandas compostas
  applied_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Garantir que ou vet_id ou freelancer_id está preenchido, mas não ambos
  CONSTRAINT demand_applications_applicant_check CHECK (
    (vet_id IS NOT NULL AND freelancer_id IS NULL) OR
    (vet_id IS NULL AND freelancer_id IS NOT NULL)
  ),
  
  -- Garantir unicidade: um vet/freelancer só pode se candidatar uma vez por demanda
  CONSTRAINT demand_applications_unique_vet UNIQUE (demand_id, vet_id),
  CONSTRAINT demand_applications_unique_freelancer UNIQUE (demand_id, freelancer_id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_demand_applications_demand_id ON demand_applications(demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_vet_id ON demand_applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_freelancer_id ON demand_applications(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_status ON demand_applications(status);
CREATE INDEX IF NOT EXISTS idx_demand_applications_invited_by ON demand_applications(invited_by);
CREATE INDEX IF NOT EXISTS idx_demand_applications_position_id ON demand_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_applied_at ON demand_applications(applied_at);

-- Comentários nas colunas
COMMENT ON TABLE demand_applications IS 'Tabela unificada para aplicações de veterinários e freelancers a demandas';
COMMENT ON COLUMN demand_applications.status IS 'Status da aplicação no lifecycle: invited, applied, approved, rejected, check_in, check_out, report_sent, report_approved';
COMMENT ON COLUMN demand_applications.invited_by IS 'ID do usuário que convidou (clínica)';
COMMENT ON COLUMN demand_applications.position_id IS 'ID da posição específica (para demandas compostas), opcional';

-- Mensagem de sucesso
SELECT 'Migration create_demand_applications_unified.sql concluída com sucesso!' as status;

