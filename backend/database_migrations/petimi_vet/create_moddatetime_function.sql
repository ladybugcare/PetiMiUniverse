-- ==========================================
-- Migration: create_moddatetime_function.sql
-- Autor: Bea + Nova 🐾
-- Objetivo: Criar função utilitária para atualizar o campo updated_at automaticamente
-- ==========================================

-- 🔹 1. Cria (ou recria) a função global
CREATE OR REPLACE FUNCTION moddatetime()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 🔹 2. (Opcional) Adiciona comentário descritivo
COMMENT ON FUNCTION moddatetime() IS 'Atualiza automaticamente o campo updated_at antes de um UPDATE.';
