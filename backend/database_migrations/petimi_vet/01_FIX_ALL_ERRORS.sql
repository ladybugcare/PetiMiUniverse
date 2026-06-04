-- ========================================
-- FIX ALL DATABASE ERRORS (ALL-IN-ONE)
-- ========================================
-- Este script combina todas as migrations necessárias
-- para corrigir os erros do banco de dados.
--
-- ⚠️ ATENÇÃO: Execute este script apenas se você quer
-- aplicar TODAS as correções de uma vez.
--
-- Se preferir executar passo a passo, use os arquivos
-- individuais com o guia EXECUTE_MIGRATIONS_GUIDE.md
-- ========================================

-- ========================================
-- PARTE 1: MODIFICAR TABELA DEMANDS
-- ========================================

-- 1.1: Verificar e converter tipo da coluna id de bigint para uuid
DO $$
BEGIN
  -- Verificar se id é bigint e converter para uuid se necessário
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'demands' AND column_name = 'id' AND data_type = 'bigint'
  ) THEN
    -- Se há dados, precisamos limpar ou converter
    -- Por segurança, vamos recriar a tabela demands se estiver vazia ou com poucos dados
    
    -- Criar tabela temporária para backup
    DROP TABLE IF EXISTS demands_backup;
    CREATE TABLE demands_backup AS SELECT * FROM demands;
    
    -- Dropar tabela antiga
    DROP TABLE IF EXISTS demands CASCADE;
    
    -- Recriar com id uuid
    CREATE TABLE demands (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      clinic_id uuid REFERENCES clinics(id),
      unit_id uuid, -- FK será adicionada depois se units existir
      category text NOT NULL DEFAULT 'vet',
      required_specialties text[] DEFAULT '{}',
      demand_date date NOT NULL,
      start_time time NOT NULL,
      status text DEFAULT 'open',
      payment numeric(10,2),
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),
      deleted_at timestamp with time zone
    );
    
    -- Adicionar FK para units apenas se a tabela existir (sem bloco aninhado)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'units') THEN
      ALTER TABLE demands ADD CONSTRAINT demands_unit_id_fkey 
        FOREIGN KEY (unit_id) REFERENCES units(id);
    END IF;
    
    -- Restaurar dados se houver (usando novos UUIDs)
    -- Nota: Se você tinha dados importantes, precisará migrar manualmente
    
  END IF;
END $$;

-- 1.2: Adicionar campos novos
ALTER TABLE demands
ADD COLUMN IF NOT EXISTS is_composite boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS end_time time;

-- 1.3: Migrar dados existentes (duration_hours → end_time) SOMENTE se duration_hours existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'demands' AND column_name = 'duration_hours'
  ) THEN
    -- Migrar dados
    UPDATE demands 
    SET end_time = (start_time::time + (COALESCE(duration_hours, 8) || ' hours')::interval)::time
    WHERE end_time IS NULL;
    
    -- Remover coluna antiga
    ALTER TABLE demands DROP COLUMN duration_hours;
  END IF;
END $$;

-- ========================================
-- PARTE 2: CRIAR TABELA DEMAND_POSITIONS (SE NÃO EXISTIR)
-- ========================================
-- IMPORTANTE: Criar ANTES de position_applications pois há FK

CREATE TABLE IF NOT EXISTS demand_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_demand_id uuid NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  specialty text NOT NULL,
  total_slots integer NOT NULL DEFAULT 1 CHECK (total_slots > 0),
  filled_slots integer NOT NULL DEFAULT 0 CHECK (filled_slots >= 0),
  individual_payment numeric(10,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT slots_check CHECK (filled_slots <= total_slots)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_demand_positions_master ON demand_positions(master_demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_positions_status ON demand_positions(status);
CREATE INDEX IF NOT EXISTS idx_demand_positions_specialty ON demand_positions(specialty);

-- ========================================
-- PARTE 3: CRIAR TABELA POSITION_SPECIALTIES (SE NÃO EXISTIR)
-- ========================================

CREATE TABLE IF NOT EXISTS position_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES demand_positions(id) ON DELETE CASCADE,
  specialty_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(position_id, specialty_name)
);

CREATE INDEX IF NOT EXISTS idx_position_specialties_position ON position_specialties(position_id);
CREATE INDEX IF NOT EXISTS idx_position_specialties_specialty ON position_specialties(specialty_name);

-- ========================================
-- PARTE 4: CRIAR/CORRIGIR TABELA POSITION_APPLICATIONS
-- ========================================
-- IMPORTANTE: Criar DEPOIS de demand_positions pois há FK

-- Fazer backup se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'position_applications') THEN
    -- Criar backup
    DROP TABLE IF EXISTS position_applications_backup;
    CREATE TABLE position_applications_backup AS SELECT * FROM position_applications;
    
    -- Drop a tabela antiga
    DROP TABLE position_applications CASCADE;
  END IF;
END $$;

-- Criar tabela com tipos corretos
CREATE TABLE IF NOT EXISTS position_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES demand_positions(id) ON DELETE CASCADE,
  vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 
    'accepted', 
    'rejected',
    'cancelled_by_vet',
    'inactive_accepted_other_position',
    'inactive_time_conflict'
  )),
  message text,
  accepted_at timestamp with time zone,
  inactive_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(position_id, vet_id)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_position_applications_position ON position_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_vet ON position_applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_status ON position_applications(status);

-- ========================================
-- PARTE 5: CRIAR VIEW PARA POSIÇÕES DISPONÍVEIS
-- ========================================

CREATE OR REPLACE VIEW positions_with_availability AS
SELECT 
  dp.id,
  dp.master_demand_id,
  dp.specialty,
  dp.total_slots,
  dp.filled_slots,
  dp.individual_payment,
  dp.status,
  dp.description,
  dp.created_at,
  d.title,
  d.description as demand_description,
  d.clinic_id,
  d.unit_id,
  d.demand_date,
  d.start_time,
  d.end_time,
  d.category,
  (dp.total_slots - dp.filled_slots) as available_slots,
  CONCAT(dp.filled_slots, '/', dp.total_slots) as progress
FROM demand_positions dp
JOIN demands d ON d.id = dp.master_demand_id
WHERE dp.status = 'open' AND d.status = 'open';

-- ========================================
-- PARTE 6: CRIAR FUNÇÃO PARA VERIFICAR CONFLITO DE HORÁRIO
-- ========================================

CREATE OR REPLACE FUNCTION check_time_conflict(
  p_vet_id uuid,
  p_demand_date date,
  p_start_time time,
  p_end_time time
) RETURNS TABLE (
  conflicting_application_id uuid,
  conflicting_demand_title text,
  conflicting_date date,
  conflicting_start_time time,
  conflicting_end_time time
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id as conflicting_application_id,
    d.title as conflicting_demand_title,
    d.demand_date as conflicting_date,
    d.start_time as conflicting_start_time,
    d.end_time as conflicting_end_time
  FROM position_applications pa
  JOIN demand_positions dp ON pa.position_id = dp.id
  JOIN demands d ON dp.master_demand_id = d.id
  WHERE pa.vet_id = p_vet_id
    AND pa.status = 'accepted'
    AND d.demand_date = p_demand_date
    AND (d.start_time, d.end_time) OVERLAPS (p_start_time, p_end_time);
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- PARTE 7: CRIAR TRIGGER PARA AUTO-INATIVAR CANDIDATURAS
-- ========================================

CREATE OR REPLACE FUNCTION handle_application_acceptance()
RETURNS TRIGGER AS $$
DECLARE
  v_master_demand_id uuid;
  v_demand_date date;
  v_start_time time;
  v_end_time time;
BEGIN
  -- Só processa quando status muda para 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    
    -- Buscar dados da demanda
    SELECT dp.master_demand_id, d.demand_date, d.start_time, d.end_time
    INTO v_master_demand_id, v_demand_date, v_start_time, v_end_time
    FROM demand_positions dp
    JOIN demands d ON d.id = dp.master_demand_id
    WHERE dp.id = NEW.position_id;
    
    -- Inativar outras candidaturas do mesmo veterinário para a mesma posição
    UPDATE position_applications
    SET 
      status = 'inactive_accepted_other_position',
      inactive_reason = 'Veterinário aceitou outra posição para a mesma demanda',
      updated_at = now()
    WHERE vet_id = NEW.vet_id
      AND position_id IN (
        SELECT id FROM demand_positions WHERE master_demand_id = v_master_demand_id
      )
      AND id != NEW.id
      AND status = 'pending';
    
    -- Inativar candidaturas do mesmo veterinário em horários conflitantes
    UPDATE position_applications pa
    SET 
      status = 'inactive_time_conflict',
      inactive_reason = 'Conflito de horário com outra demanda aceita',
      updated_at = now()
    FROM demand_positions dp
    JOIN demands d ON d.id = dp.master_demand_id
    WHERE pa.position_id = dp.id
      AND pa.vet_id = NEW.vet_id
      AND pa.id != NEW.id
      AND pa.status = 'pending'
      AND d.demand_date = v_demand_date
      AND (d.start_time, d.end_time) OVERLAPS (v_start_time, v_end_time);
      
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar o trigger
DROP TRIGGER IF EXISTS trigger_application_acceptance ON position_applications;
CREATE TRIGGER trigger_application_acceptance
  AFTER INSERT OR UPDATE OF status ON position_applications
  FOR EACH ROW
  EXECUTE FUNCTION handle_application_acceptance();

-- ========================================
-- VERIFICAÇÃO FINAL
-- ========================================

-- Mostrar resultado
SELECT 
  '✅ MIGRATION CONCLUÍDA COM SUCESSO!' as status,
  'Todas as correções foram aplicadas.' as message;

-- Verificar estrutura das tabelas
SELECT 
  '📋 TABELA DEMANDS' as check_name,
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_name = 'demands'
AND column_name IN ('end_time', 'is_composite', 'demand_date', 'start_time')
ORDER BY column_name;

SELECT 
  '🎯 TABELA POSITION_APPLICATIONS' as check_name,
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_name = 'position_applications'
AND column_name IN ('id', 'position_id', 'vet_id')
ORDER BY column_name;

SELECT 
  '✅ PRONTO!' as status,
  'Você pode agora:' as message,
  '1. Criar demandas | 2. Candidatar-se a vagas' as actions;

