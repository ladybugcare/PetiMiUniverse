-- ===========================================================
-- 🧱 PETIVET - FULL DATABASE STRUCTURE SYNC
-- Sincroniza local/staging/production sem afetar dados
-- ===========================================================

-- ===========================================================
-- 🔹 1. Garantir dependências base
-- ===========================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================================
-- 🔹 2. Tabela ADMINS
-- ===========================================================
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 3. Tabela APPLICATIONS
-- ===========================================================
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid NOT NULL,
  vet_id uuid NOT NULL,
  message text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 4. Tabela AUDIT_LOGS
-- ===========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  clinic_id uuid,
  unit_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 5. Tabela CLINICS
-- ===========================================================
CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  description text,
  technical_manager text,
  photo_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- ===========================================================
-- 🔹 6. Tabela CLINIC_USERS
-- ===========================================================
CREATE TABLE IF NOT EXISTS clinic_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  unit_id uuid,
  name text,
  email text,
  phone text,
  user_type text DEFAULT 'clinic',
  role text DEFAULT 'CSTAFF',
  status text DEFAULT 'active',
  invited_by uuid,
  invited_at timestamptz,
  accepted_at timestamptz,
  first_login_at timestamptz,
  first_login_completed_at timestamptz,
  onboarding_state jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- FK: clinic_users → clinics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'clinic_users_clinic_fkey'
  ) THEN
    ALTER TABLE clinic_users
      ADD CONSTRAINT clinic_users_clinic_fkey
      FOREIGN KEY (clinic_id)
      REFERENCES clinics(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- FK: clinic_users → units
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'clinic_users_unit_fkey'
  ) THEN
    ALTER TABLE clinic_users
      ADD CONSTRAINT clinic_users_unit_fkey
      FOREIGN KEY (unit_id)
      REFERENCES units(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ===========================================================
-- 🔹 7. Tabela UNITS
-- ===========================================================
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  name text NOT NULL,
  nickname text,
  cnpj text,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  phone text,
  technical_manager text,
  is_main boolean DEFAULT false,
  status text DEFAULT 'active',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- FK: units → clinics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'units_clinic_fkey'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_clinic_fkey
      FOREIGN KEY (clinic_id)
      REFERENCES clinics(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ===========================================================
-- 🔹 8. Tabela VETS
-- ===========================================================
CREATE TABLE IF NOT EXISTS vets (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  crmv text,
  phone text,
  clinic_id uuid,
  specialties text[] DEFAULT '{}'::text[],
  certificates text[] DEFAULT '{}'::text[],
  experience text,
  bio text,
  photo_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 9. Tabela DEMANDS
-- ===========================================================
CREATE TABLE IF NOT EXISTS demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  clinic_id uuid,
  unit_id uuid,
  category text DEFAULT 'vet',
  required_specialties text[] DEFAULT '{}'::text[],
  demand_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  is_composite boolean DEFAULT false,
  status text DEFAULT 'open',
  payment numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- ===========================================================
-- 🔹 10. Tabela DEMAND_POSITIONS
-- ===========================================================
CREATE TABLE IF NOT EXISTS demand_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_demand_id uuid NOT NULL,
  specialty text NOT NULL,
  description text,
  total_slots integer DEFAULT 1,
  filled_slots integer DEFAULT 0,
  individual_payment numeric,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 11. Tabelas MARKETPLACE
-- ===========================================================
CREATE TABLE IF NOT EXISTS marketplace_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  vet_id uuid,
  title text NOT NULL,
  description text,
  price numeric,
  category text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 12. PLANOS E ASSINATURAS
-- ===========================================================
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text DEFAULT 'clinic',
  monthly_price numeric,
  max_units integer,
  max_demands integer,
  max_users integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinic_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  start_date timestamptz DEFAULT now(),
  renewal_date timestamptz,
  status text DEFAULT 'active'
);

-- ===========================================================
-- 🔹 13. SUPORTE
-- ===========================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_role text NOT NULL,
  message text,
  status text DEFAULT 'open',
  admin_reply text,
  admin_id uuid,
  user_read boolean DEFAULT true,
  last_message_at timestamptz,
  last_message_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL,
  message text NOT NULL,
  read_by_receiver boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  rating integer NOT NULL,
  comment text,
  created_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 14. CONVITES
-- ===========================================================
CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  clinic_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  role text NOT NULL,
  invited_by uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- ===========================================================
-- 🔹 15. ESPECIALIDADES
-- ===========================================================
CREATE TABLE IF NOT EXISTS specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- ===========================================================
-- ✅ FIM
-- ===========================================================
