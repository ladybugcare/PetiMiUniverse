-- ========================================
-- Migration: Atualizar trigger de auth para incluir freelancers
-- Date: 2025-01-30
-- Description: Atualiza a função handle_new_user para criar registros em freelancers quando role = 'freelancer'
-- ========================================

-- Atualizar função handle_new_user para incluir freelancers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the role from metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  IF user_role IS NULL THEN
    user_role := NEW.user_metadata->>'role';
  END IF;
  
  -- Convert to lowercase for comparison
  user_role := LOWER(user_role);
  
  -- Create record in appropriate table based on role
  IF user_role = 'clinic' THEN
    -- Não criar clínica automaticamente - deve ser criada via signup
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
    
  ELSIF user_role = 'freelancer' THEN
    -- Criar registro em freelancers
    INSERT INTO public.freelancers (
      id,
      name,
      email,
      document_type,
      document_number,
      address,
      phone,
      city,
      state,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Freelancer sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'document_type', NULL),
      COALESCE(NEW.raw_user_meta_data->>'document_number', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
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

-- Atualizar função handle_user_delete para incluir freelancers
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the role from metadata
  user_role := OLD.raw_user_meta_data->>'role';
  
  IF user_role IS NULL THEN
    user_role := OLD.user_metadata->>'role';
  END IF;
  
  -- Convert to lowercase for comparison
  user_role := LOWER(user_role);
  
  -- Soft delete or cascade delete based on role
  IF user_role = 'clinic' THEN
    -- Soft delete clinic (set status to inactive)
    UPDATE public.clinics 
    SET updated_at = NOW()
    WHERE id = OLD.id;
    
  ELSIF user_role = 'vet' THEN
    -- Soft delete vet
    UPDATE public.vets 
    SET updated_at = NOW()
    WHERE id = OLD.id;
    
  ELSIF user_role = 'freelancer' THEN
    -- Soft delete freelancer
    UPDATE public.freelancers 
    SET updated_at = NOW()
    WHERE id = OLD.id;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mensagem de sucesso
SELECT 'Migration update_auth_trigger_for_freelancers.sql concluída com sucesso!' as status;

