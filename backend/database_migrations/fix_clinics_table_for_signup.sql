-- ========================================
-- FIX: Adicionar colunas faltantes na tabela clinics
-- Date: 2025-10-29
-- Description: Adiciona coluna 'status' e atualiza o trigger para funcionar sem ela
-- ========================================

-- ========================================
-- OPÇÃO 1: Adicionar coluna status (RECOMENDADO)
-- ========================================
-- Se você quer o sistema de aprovação de clínicas:

ALTER TABLE clinics 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_unit', 'pending_approval', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_clinics_status ON clinics(status);

-- Atualizar clínicas existentes para 'active'
UPDATE clinics 
SET status = 'active' 
WHERE status IS NULL;

-- ========================================
-- OPÇÃO 2: Atualizar trigger para não usar 'status'
-- ========================================
-- Se você NÃO quer o sistema de aprovação (mais simples):

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  v_clinic_id UUID;
  v_unit_id UUID;
BEGIN
  -- Get the role from metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  -- If no role, try user_metadata
  IF user_role IS NULL THEN
    user_role := NEW.user_metadata->>'role';
  END IF;
  
  -- Create appropriate record based on role
  IF user_role = 'clinic' THEN
    -- Create clinic record (SEM status se a coluna não existir)
    INSERT INTO public.clinics (
      id,
      name,
      email,
      cnpj,
      phone,
      address,
      city,
      state,
      technical_manager,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', 'Endereço não cadastrado'),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      NOW(),
      NOW()
    )
    RETURNING id INTO v_clinic_id;
    
    -- Create main unit for the clinic
    INSERT INTO public.units (
      clinic_id,
      name,
      cnpj,
      address,
      city,
      state,
      phone,
      technical_manager,
      is_main,
      status
    ) VALUES (
      v_clinic_id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome') || ' - Unidade Principal',
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', 'Endereço não cadastrado'),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      true,
      'active'
    )
    RETURNING id INTO v_unit_id;
    
    -- Create CADMIN clinic_user entry for clinic owner
    INSERT INTO public.clinic_users (
      user_id,
      clinic_id,
      unit_id,
      role,
      status,
      accepted_at
    ) VALUES (
      NEW.id,
      v_clinic_id,
      v_unit_id,
      'CADMIN',
      'active',
      NOW()
    );
    
  ELSIF user_role = 'vet' THEN
    -- Create vet record
    INSERT INTO public.vets (
      id,
      name,
      email,
      crmv,
      phone,
      specialties,
      city,
      state,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Veterinário sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'crmv', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE((NEW.raw_user_meta_data->>'specialties')::text[], ARRAY[]::text[]),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and continue (don't block user creation)
    RAISE WARNING 'Erro em handle_new_user: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- VERIFICAÇÃO
-- ========================================
SELECT 'Migration fix_clinics_table_for_signup.sql concluída com sucesso!' as status;

-- Verificar se a coluna status existe agora
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clinics' AND column_name = 'status'
    ) THEN '✅ Coluna status existe'
    ELSE '⚠️  Coluna status não existe (trigger foi atualizado para não precisar dela)'
  END as result;

