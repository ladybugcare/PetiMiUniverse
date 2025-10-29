-- ========================================
-- Auth Triggers: Auto-populate tables on user creation
-- Date: 2025-10-29
-- Description: Automatically creates records in clinics/vets tables when users sign up
-- ========================================

-- ========================================
-- 1. Function: Handle new user signup
-- ========================================
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
    -- Create clinic record
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
      COALESCE(NEW.raw_user_meta_data->>'address', ''),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      NOW(),
      NOW()
    );
    
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
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome') || ' - Unidade Principal',
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', 'Endereço não cadastrado'),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      true,
      'active'
    );
    
    -- Create CADMIN clinic_user entry for clinic owner
    INSERT INTO public.clinic_users (
      user_id,
      clinic_id,
      unit_id,
      role,
      status,
      accepted_at
    )
    SELECT 
      NEW.id,
      NEW.id,
      u.id,
      'CADMIN',
      'active',
      NOW()
    FROM public.units u
    WHERE u.clinic_id = NEW.id AND u.is_main = true;
    
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
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 2. Create trigger on auth.users
-- ========================================
-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create new trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- 3. Function: Handle user deletion
-- ========================================
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
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 4. Create trigger for user deletion
-- ========================================
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_delete();

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check if triggers were created successfully
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'auth' 
  AND event_object_table = 'users';

-- ========================================
-- TESTING THE TRIGGER
-- ========================================
-- To test, create a user via Supabase Dashboard and check if it appears in clinics/vets table

-- Test query for clinics:
-- SELECT c.*, u.email 
-- FROM clinics c
-- JOIN auth.users u ON u.id = c.id;

-- Test query for vets:
-- SELECT v.*, u.email 
-- FROM vets v
-- JOIN auth.users u ON u.id = v.id;

-- ========================================
-- NOTES
-- ========================================
-- 1. This trigger runs AFTER a user is created in auth.users
-- 2. It automatically creates the corresponding clinic/vet record
-- 3. For clinics, it also creates a main unit and CADMIN role
-- 4. The role must be set in raw_user_meta_data during signup
-- 5. If creating users manually in Supabase Dashboard, set the role first!

