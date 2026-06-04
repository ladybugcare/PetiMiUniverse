-- ========================================
-- Migration: Corrigir campo experience no trigger de veterinário
-- Date: 2025-01-30
-- Description: 
--   1. Remove constraint NOT NULL da coluna experience (campo foi removido do formulário)
--   2. Atualiza trigger handle_new_user para incluir campo experience com NULL
-- ========================================

-- 1. Tornar coluna experience nullable
ALTER TABLE vets
ALTER COLUMN experience DROP NOT NULL;

-- Comentário atualizado
COMMENT ON COLUMN vets.experience IS 'Texto descritivo da experiência do veterinário (opcional)';

-- 2. Atualizar função handle_new_user para incluir campo experience
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the role from metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  -- If no role, try user_metadata
  IF user_role IS NULL THEN
    user_role := NEW.user_metadata->>'role';
  END IF;
  
  -- Create appropriate record based on role
  IF user_role = 'clinic' THEN
    -- 1. Criar clinic com status pending_unit
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
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', ''),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      'pending_unit',
      NOW(),
      NOW()
    );
    
    -- 2. Criar CADMIN mas com status pending_activation (sem unit_id)
    INSERT INTO public.clinic_users (
      user_id,
      clinic_id,
      role,
      status,
      accepted_at
    ) VALUES (
      NEW.id,
      NEW.id,
      'CADMIN',
      'pending_activation',
      NOW()
    );
    
    -- NÃO criar unidade automaticamente!
    
  ELSIF user_role = 'vet' THEN
    -- Atualizado para incluir novos campos: document_type, document_number, address e experience
    INSERT INTO public.vets (
      id,
      name,
      email,
      crmv,
      document_type,
      document_number,
      address,
      phone,
      specialties,
      experience,
      city,
      state,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Veterinário sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'crmv', NULL),
      COALESCE(NEW.raw_user_meta_data->>'document_type', NULL),
      COALESCE(NEW.raw_user_meta_data->>'document_number', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE((NEW.raw_user_meta_data->>'specialties')::text[], ARRAY[]::text[]),
      COALESCE(NEW.raw_user_meta_data->>'experience', NULL),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
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

-- Recriar trigger (caso não exista)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

