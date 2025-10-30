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
-- MIGRATION 0: CREATE BASE TABLES
-- ========================================
-- Tabelas que precisam existir antes dos triggers

-- Tabela CLINICS
CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  cnpj text UNIQUE,
  phone text,
  address text,
  city text,
  state text,
  technical_manager text,
  description text,
  photo_url text,
  status text DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinics_email ON clinics(email);
CREATE INDEX IF NOT EXISTS idx_clinics_cnpj ON clinics(cnpj);
CREATE INDEX IF NOT EXISTS idx_clinics_status ON clinics(status);

-- Tabela VETS
CREATE TABLE IF NOT EXISTS vets (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  crmv text UNIQUE,
  phone text,
  specialties text[] DEFAULT '{}',
  city text,
  state text,
  bio text,
  photo_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vets_email ON vets(email);
CREATE INDEX IF NOT EXISTS idx_vets_crmv ON vets(crmv);
CREATE INDEX IF NOT EXISTS idx_vets_specialties ON vets USING GIN (specialties);

-- Tabela DEMANDS (tabela base antes de alterações)
CREATE TABLE IF NOT EXISTS demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  unit_id uuid, -- FK será adicionada depois
  category text NOT NULL DEFAULT 'vet',
  required_specialties text[] DEFAULT '{}',
  demand_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  is_composite boolean DEFAULT false,
  status text DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled', 'completed')),
  payment numeric(10,2),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_demands_clinic_id ON demands(clinic_id);
CREATE INDEX IF NOT EXISTS idx_demands_status ON demands(status);
CREATE INDEX IF NOT EXISTS idx_demands_demand_date ON demands(demand_date);
CREATE INDEX IF NOT EXISTS idx_demands_category ON demands(category);

-- Tabela APPLICATIONS (candidaturas simples, antes do sistema de posições)
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid REFERENCES demands(id) ON DELETE CASCADE NOT NULL,
  vet_id uuid REFERENCES vets(id) ON DELETE CASCADE NOT NULL,
  message text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(demand_id, vet_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_demand_id ON applications(demand_id);
CREATE INDEX IF NOT EXISTS idx_applications_vet_id ON applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- Tabela PETS
CREATE TABLE IF NOT EXISTS pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  species text NOT NULL,
  breed text,
  age integer,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pets_clinic_id ON pets(clinic_id);

-- Tabela MARKETPLACE_ITEMS (para futuros marketplaces)
CREATE TABLE IF NOT EXISTS marketplace_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  vet_id uuid REFERENCES vets(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  price numeric(10,2),
  category text,
  status text DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_items_clinic_id ON marketplace_items(clinic_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_vet_id ON marketplace_items(vet_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_status ON marketplace_items(status);

-- Tabela MARKETPLACE_MESSAGES
CREATE TABLE IF NOT EXISTS marketplace_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES marketplace_items(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_messages_item_id ON marketplace_messages(item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_sender_id ON marketplace_messages(sender_id);

-- ========================================
-- MIGRATION 1: ADD CATEGORY AND SPECIALTIES
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
-- MIGRATION 2: UNITS AND PERMISSIONS SYSTEM
-- ========================================

CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  nickname text,
  cnpj text UNIQUE,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  phone text,
  technical_manager text,
  is_main boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_review', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_clinic_id ON units(clinic_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
CREATE INDEX IF NOT EXISTS idx_units_status_pending ON units(status) WHERE status = 'pending_review';

CREATE TABLE IF NOT EXISTS clinic_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'pending_activation')),
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

-- Adicionar FK para units em demands
ALTER TABLE demands
ADD CONSTRAINT demands_unit_id_fkey 
FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_demands_unit_id ON demands(unit_id);

-- ========================================
-- MIGRATION 3: CLINIC APPROVAL SYSTEM
-- ========================================

ALTER TABLE clinics 
DROP CONSTRAINT IF EXISTS clinics_status_check;

ALTER TABLE clinics 
ADD CONSTRAINT clinics_status_check 
CHECK (status IN ('pending_unit', 'pending_approval', 'active', 'suspended', 'rejected'));

-- ========================================
-- MIGRATION 4: DEMAND POSITIONS SYSTEM
-- ========================================

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
-- MIGRATION 5: SUPPORT TICKETS
-- ========================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role text NOT NULL CHECK (user_role IN ('clinic', 'vet')),
  message text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply text,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_read boolean DEFAULT true,
  last_message_at timestamp with time zone,
  last_message_by text CHECK (last_message_by IN ('user', 'admin')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_id ON support_tickets(admin_id);

-- ========================================
-- MIGRATION 6: CONVERSATION AND EVALUATION
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

-- ========================================
-- MIGRATION 7: CREATE AUTH TRIGGERS
-- ========================================
-- IMPORTANTE: Triggers devem ser criados POR ÚLTIMO!

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := NEW.raw_user_meta_data->>'role';
  
  IF user_role IS NULL THEN
    user_role := NEW.user_metadata->>'role';
  END IF;
  
  IF user_role = 'clinic' THEN
    INSERT INTO public.clinics (
      id, name, email, cnpj, phone, address, city, state, technical_manager, created_at, updated_at
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
      NOW(), NOW()
    );
    
    INSERT INTO public.units (
      clinic_id, name, cnpj, address, city, state, phone, technical_manager, is_main, status
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome') || ' - Unidade Principal',
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', 'Endereço não cadastrado'),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      true, 'active'
    );
    
    INSERT INTO public.clinic_users (user_id, clinic_id, unit_id, role, status, accepted_at)
    SELECT NEW.id, NEW.id, u.id, 'CADMIN', 'active', NOW()
    FROM public.units u
    WHERE u.clinic_id = NEW.id AND u.is_main = true;
    
  ELSIF user_role = 'vet' THEN
    INSERT INTO public.vets (
      id, name, email, crmv, phone, specialties, city, state, created_at, updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Veterinário sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'crmv', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE((NEW.raw_user_meta_data->>'specialties')::text[], ARRAY[]::text[]),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      NOW(), NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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
    UPDATE public.clinics SET updated_at = NOW() WHERE id = OLD.id;
  ELSIF user_role = 'vet' THEN
    UPDATE public.vets SET updated_at = NOW() WHERE id = OLD.id;
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
-- WHERE event_object_schema IN ('auth', 'public');
