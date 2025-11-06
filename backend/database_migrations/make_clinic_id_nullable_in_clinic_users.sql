-- ========================================
-- Migration: Tornar clinic_id nullable em clinic_users
-- Date: 2025-11-06
-- Description: Permite que clinic_users exista sem clinic_id inicialmente
--              A clínica será criada apenas quando a primeira unidade for cadastrada
-- ========================================

-- 1. Remover constraint NOT NULL de clinic_id (se existir)
ALTER TABLE clinic_users 
ALTER COLUMN clinic_id DROP NOT NULL;

-- 2. Manter a FK, mas agora permite NULL
-- A FK já existe, apenas removemos o NOT NULL acima
-- Se a FK não existir, criar:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'clinic_users_clinic_id_fkey'
    AND table_name = 'clinic_users'
  ) THEN
    ALTER TABLE clinic_users
    ADD CONSTRAINT clinic_users_clinic_id_fkey 
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Adicionar constraint para garantir que quando clinic_id existe, é válido
-- (A FK já faz isso, mas podemos adicionar um check adicional se necessário)
-- Por enquanto, a FK é suficiente

-- 4. Criar índice para melhor performance em queries com clinic_id NULL
CREATE INDEX IF NOT EXISTS idx_clinic_users_clinic_id_null 
ON clinic_users(clinic_id) 
WHERE clinic_id IS NULL;

-- 5. Criar índice para status quando clinic_id é NULL (usuários pendentes)
CREATE INDEX IF NOT EXISTS idx_clinic_users_pending_clinic 
ON clinic_users(status, clinic_id) 
WHERE clinic_id IS NULL;

-- Mensagem de sucesso
SELECT 
  'Migration make_clinic_id_nullable_in_clinic_users.sql concluída com sucesso!' as status,
  COUNT(*) FILTER (WHERE clinic_id IS NULL) as usuarios_sem_clinica,
  COUNT(*) FILTER (WHERE clinic_id IS NOT NULL) as usuarios_com_clinica
FROM clinic_users;

