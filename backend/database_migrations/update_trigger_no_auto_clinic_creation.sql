-- ========================================
-- Migration: Atualizar Trigger para não criar clinics automaticamente
-- Date: 2025-11-06
-- Description: Modifica handle_new_user para criar apenas clinic_users sem clinic_id
--              A clínica será criada apenas quando a primeira unidade for cadastrada
-- ========================================

-- Atualizar função handle_new_user para não criar clinic automaticamente
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
    -- ✅ NOVO FLUXO: Criar apenas clinic_users, SEM criar clinic
    -- A clinic será criada quando o usuário criar a primeira unidade
    INSERT INTO public.clinic_users (
      user_id,
      clinic_id,        -- NULL inicialmente
      unit_id,          -- NULL inicialmente
      role,
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NULL,             -- ✅ clinic_id será NULL até criar primeira unidade
      NULL,             -- ✅ unit_id será NULL até criar primeira unidade
      'CADMIN',         -- Role padrão para criador da clínica
      'pending_clinic', -- ✅ Status: aguardando criar clínica
      NOW(),
      NOW()
    );
    
    -- ❌ NÃO criar registro em clinics automaticamente!
    -- ❌ NÃO criar unidade automaticamente!
    
  ELSIF user_role = 'vet' THEN
    -- Manter lógica de vet inalterada
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
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger (já deve existir, mas garantimos que está correto)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Mensagem de sucesso
SELECT 'Migration update_trigger_no_auto_clinic_creation.sql concluída com sucesso!' as status;

