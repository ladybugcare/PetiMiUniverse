-- ==========================================
-- Migration: add_clinic_roles_enum_and_constraint.sql
-- Autor: Bea + Nova 🐾
-- Objetivo: padronizar roles de usuários de clínicas
-- ==========================================

-- 🔹 1. Criar o tipo ENUM para roles de clínica (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinic_user_role') THEN
    CREATE TYPE clinic_user_role AS ENUM (
      'CADMIN',      -- Administrador da clínica
      'CMANAGER',    -- Gerente da clínica
      'CSTAFF',      -- Funcionário / colaborador
      'CRECEPTION',  -- Recepcionista
      'CBATH',       -- Banho e tosa
      'CAUXILIARY',  -- Auxiliar veterinário
      'CMARKETING'   -- Marketing / comunicação
    );
  END IF;
END $$;

-- 🔹 2. Adicionar a coluna role caso ainda não exista
ALTER TABLE clinic_users
ADD COLUMN IF NOT EXISTS role clinic_user_role DEFAULT 'CSTAFF';

-- 🔹 3. Garantir valor válido
ALTER TABLE clinic_users
ALTER COLUMN role SET DEFAULT 'CSTAFF';

-- 🔹 4. Adicionar colunas padrão se ainda não existirem
ALTER TABLE clinic_users
ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 🔹 5. Atualizar trigger de updated_at (se quiser manter atualizado automaticamente)
DROP TRIGGER IF EXISTS update_clinic_users_updated_at ON clinic_users;

CREATE TRIGGER update_clinic_users_updated_at
BEFORE UPDATE ON clinic_users
FOR EACH ROW
EXECUTE FUNCTION moddatetime(updated_at);

-- 🔹 6. Conferência final
COMMENT ON COLUMN clinic_users.role IS 'Role interna do usuário na clínica (CADMIN, CMANAGER, CSTAFF, etc)';
