-- ========================================
-- Migration: Adicionar Foreign Key nomeada para units.clinic_id
-- Date: 2025-01-30
-- Description: Adiciona constraint nomeada explicitamente para permitir joins no Supabase
-- ========================================

-- Remover todas as constraints de foreign key existentes na coluna clinic_id
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Buscar todas as foreign keys na coluna clinic_id da tabela units
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'units'::regclass
          AND contype = 'f'
          AND conkey = ARRAY[
            (SELECT attnum 
             FROM pg_attribute 
             WHERE attrelid = 'units'::regclass 
               AND attname = 'clinic_id')
          ]
    LOOP
        EXECUTE format('ALTER TABLE units DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;
END $$;

-- Adicionar constraint nomeada explicitamente
ALTER TABLE units
ADD CONSTRAINT units_clinic_id_fkey
FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;

-- Verificação
SELECT 'Migration add_named_fk_units_clinic_id.sql concluída com sucesso!' as status;

-- Verificar se a constraint foi criada corretamente
SELECT 
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as referenced_table,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'units'::regclass
  AND conname = 'units_clinic_id_fkey'
  AND contype = 'f';

