-- ========================================
-- MIGRAÇÕES CONSOLIDADAS PARA STAGING
-- PetiVet - Ambiente de Staging
-- Data: 2025-01-30
-- ========================================
--
-- INSTRUÇÕES:
-- 1. Copie TODO este arquivo
-- 2. Acesse o Supabase SQL Editor: https://app.supabase.com/project/[seu-projeto]/sql
-- 3. Cole o conteúdo completo
-- 4. Execute (Run)
-- 5. Verifique se não há erros no output
--
-- IMPORTANTE: Execute este arquivo em um banco VAZIO (projeto staging novo)
-- ========================================

-- ========================================
-- MIGRATION 1: CREATE AUTH TRIGGERS
-- ========================================
-- Auto-populate tables on user creation

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

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Handle user deletion
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := OLD.raw_user_meta_data->>'role';
  
  IF user_role IS NULL THEN
    user_role := OLD.user_metadata->>'role';
  END IF;
  
  IF user_role = 'clinic' THEN
    UPDATE public.clinics 
    SET updated_at = NOW()
    WHERE id = OLD.id;
    
  ELSIF user_role = 'vet' THEN
    UPDATE public.vets 
    SET updated_at = NOW()
    WHERE id = OLD.id;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_delete();

-- ========================================
-- MIGRATION 2: ADD CATEGORY AND SPECIALTIES
-- ========================================

ALTER TABLE demands 
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'vet' 
CHECK (category IN ('vet', 'freelancer', 'clinic', 'other'));

CREATE TABLE IF NOT EXISTS specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('vet', 'freelancer', 'clinic', 'other')),
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_specialties_category ON specialties(category);
CREATE INDEX IF NOT EXISTS idx_demands_category ON demands(category);

-- Insert veterinary specialties
INSERT INTO specialties (name, category, description) VALUES
  ('Cirurgia', 'vet', 'Procedimentos cirúrgicos gerais e especializados'),
  ('Clínica Geral', 'vet', 'Consultas e atendimentos clínicos gerais'),
  ('Dermatologia', 'vet', 'Doenças de pele e pelagem'),
  ('Cardiologia', 'vet', 'Doenças cardíacas e circulatórias'),
  ('Ortopedia', 'vet', 'Problemas ósseos e articulares'),
  ('Oftalmologia', 'vet', 'Doenças oculares'),
  ('Oncologia', 'vet', 'Tratamento de câncer'),
  ('Emergência', 'vet', 'Atendimento emergencial 24h'),
  ('Anestesiologia', 'vet', 'Anestesia para procedimentos'),
  ('Diagnóstico por Imagem', 'vet', 'Raio-X, ultrassom, etc.'),
  ('Neurologia', 'vet', 'Doenças neurológicas'),
  ('Odontologia', 'vet', 'Saúde dental e bucal'),
  ('Medicina Felina', 'vet', 'Especialização em gatos'),
  ('Medicina de Animais Silvestres', 'vet', 'Atendimento a animais exóticos'),
  ('Nutrição', 'vet', 'Orientação nutricional')
ON CONFLICT (name) DO NOTHING;

-- Insert freelancer specialties
INSERT INTO specialties (name, category, description) VALUES
  ('Grooming', 'freelancer', 'Banho, tosa e estética pet'),
  ('Adestramento', 'freelancer', 'Treinamento e educação canina'),
  ('Passeador', 'freelancer', 'Passeios e exercícios para pets'),
  ('Cuidador', 'freelancer', 'Cuidados diários com animais'),
  ('Pet Sitter', 'freelancer', 'Hospedagem e cuidado temporário'),
  ('Fotografia Pet', 'freelancer', 'Fotografia profissional de animais'),
  ('Transporte Pet', 'freelancer', 'Transporte seguro de animais'),
  ('Fisioterapia', 'freelancer', 'Fisioterapia e reabilitação animal')
ON CONFLICT (name) DO NOTHING;

-- ========================================
-- MIGRATION 3: UNITS AND PERMISSIONS SYSTEM
-- ========================================

CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  cnpj text UNIQUE,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  phone text,
  technical_manager text,
  is_main boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_clinic_id ON units(clinic_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);

CREATE TABLE IF NOT EXISTS clinic_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_users_user_id ON clinic_users(user_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_clinic_id ON clinic_users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_unit_id ON clinic_users(unit_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_role ON clinic_users(role);

CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL')),
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON user_invitations(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  clinic_id uuid REFERENCES clinics(id),
  unit_id uuid REFERENCES units(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_id ON audit_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE demands
ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id);

CREATE INDEX IF NOT EXISTS idx_demands_unit_id ON demands(unit_id);

-- ========================================
-- MIGRATION 4: CLINIC APPROVAL SYSTEM
-- ========================================

ALTER TABLE clinics 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

UPDATE clinics SET status = 'active' WHERE status IS NULL;

ALTER TABLE clinics 
DROP CONSTRAINT IF EXISTS clinics_status_check;

ALTER TABLE clinics 
ADD CONSTRAINT clinics_status_check 
CHECK (status IN ('pending_unit', 'pending_approval', 'active', 'suspended', 'rejected'));

ALTER TABLE units 
DROP CONSTRAINT IF EXISTS units_status_check;

ALTER TABLE units 
ADD CONSTRAINT units_status_check 
CHECK (status IN ('active', 'inactive', 'pending_review', 'approved', 'rejected'));

ALTER TABLE clinic_users 
DROP CONSTRAINT IF EXISTS clinic_users_status_check;

ALTER TABLE clinic_users 
ADD CONSTRAINT clinic_users_status_check 
CHECK (status IN ('active', 'inactive', 'pending', 'pending_activation'));

ALTER TABLE units
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_clinics_status ON clinics(status);
CREATE INDEX IF NOT EXISTS idx_units_status_pending ON units(status) WHERE status = 'pending_review';

-- ========================================
-- MIGRATION 5: DEMAND POSITIONS SYSTEM
-- ========================================

ALTER TABLE demands
ADD COLUMN IF NOT EXISTS is_composite boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS end_time time;

UPDATE demands 
SET end_time = (start_time::time + (COALESCE(duration_hours, 8) || ' hours')::interval)::time
WHERE end_time IS NULL;

ALTER TABLE demands DROP COLUMN IF EXISTS duration_hours;

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

CREATE INDEX IF NOT EXISTS idx_demand_positions_master ON demand_positions(master_demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_positions_status ON demand_positions(status);
CREATE INDEX IF NOT EXISTS idx_demand_positions_specialty ON demand_positions(specialty);

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

CREATE INDEX IF NOT EXISTS idx_position_applications_position ON position_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_vet ON position_applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_status ON position_applications(status);

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

CREATE OR REPLACE FUNCTION handle_application_acceptance()
RETURNS TRIGGER AS $$
DECLARE
  v_master_demand_id uuid;
  v_demand_date date;
  v_start_time time;
  v_end_time time;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    
    SELECT dp.master_demand_id, d.demand_date, d.start_time, d.end_time
    INTO v_master_demand_id, v_demand_date, v_start_time, v_end_time
    FROM demand_positions dp
    JOIN demands d ON dp.master_demand_id = d.id
    WHERE dp.id = NEW.position_id;
    
    UPDATE position_applications
    SET 
      status = 'inactive_accepted_other_position',
      inactive_reason = 'Veterinário aceito em outra posição desta demanda',
      updated_at = now()
    WHERE vet_id = NEW.vet_id
      AND position_id IN (
        SELECT id FROM demand_positions WHERE master_demand_id = v_master_demand_id
      )
      AND id != NEW.id
      AND status IN ('pending');
    
    UPDATE position_applications pa
    SET 
      status = 'inactive_time_conflict',
      inactive_reason = 'Indisponível - Aceito em outra demanda no mesmo horário',
      updated_at = now()
    FROM demand_positions dp
    JOIN demands d ON dp.master_demand_id = d.id
    WHERE pa.position_id = dp.id
      AND pa.vet_id = NEW.vet_id
      AND pa.id != NEW.id
      AND pa.status IN ('pending')
      AND dp.master_demand_id != v_master_demand_id
      AND d.demand_date = v_demand_date
      AND (d.start_time, d.end_time) OVERLAPS (v_start_time, v_end_time);
    
    UPDATE demand_positions
    SET 
      filled_slots = filled_slots + 1,
      updated_at = now()
    WHERE id = NEW.position_id;
    
    UPDATE demand_positions
    SET 
      status = 'filled',
      updated_at = now()
    WHERE id = NEW.position_id
      AND filled_slots >= total_slots;
      
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_application_acceptance ON position_applications;
CREATE TRIGGER trigger_application_acceptance
AFTER UPDATE ON position_applications
FOR EACH ROW
EXECUTE FUNCTION handle_application_acceptance();

CREATE OR REPLACE FUNCTION handle_application_rejection()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'accepted' AND NEW.status IN ('rejected', 'cancelled_by_vet') THEN
    
    UPDATE demand_positions
    SET 
      filled_slots = GREATEST(filled_slots - 1, 0),
      status = 'open',
      updated_at = now()
    WHERE id = OLD.position_id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_application_rejection ON position_applications;
CREATE TRIGGER trigger_application_rejection
AFTER UPDATE ON position_applications
FOR EACH ROW
EXECUTE FUNCTION handle_application_rejection();

-- ========================================
-- MIGRATION 6: SUPPORT TICKETS
-- ========================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role text NOT NULL CHECK (user_role IN ('clinic', 'vet')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply text,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_read boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_id ON support_tickets(admin_id);

-- ========================================
-- MIGRATION 7: CONVERSATION AND EVALUATION
-- ========================================

CREATE TABLE IF NOT EXISTS ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'admin')),
  message text NOT NULL CHECK (length(message) >= 5 AND length(message) <= 1000),
  read_by_receiver boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id ON ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages(created_at);

CREATE TABLE IF NOT EXISTS ticket_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES support_tickets(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 500),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_evaluations_ticket_id ON ticket_evaluations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_evaluations_rating ON ticket_evaluations(rating);

ALTER TABLE support_tickets 
  ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_message_by text CHECK (last_message_by IN ('user', 'admin'));

ALTER TABLE support_tickets 
  ALTER COLUMN message DROP NOT NULL,
  ALTER COLUMN user_read DROP NOT NULL;

-- ========================================
-- FINALIZAÇÃO
-- ========================================

SELECT 'Migrations consolidadas executadas com sucesso!' as status,
       'Ambiente staging está pronto para uso!' as message;

-- ========================================
-- VERIFICAÇÃO RÁPIDA
-- ========================================
-- Execute estas queries para verificar:

-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- ORDER BY table_name;

-- SELECT COUNT(*) as total_specialties FROM specialties;

-- SELECT trigger_name FROM information_schema.triggers 
-- WHERE event_object_schema = 'auth' OR event_object_schema = 'public';

