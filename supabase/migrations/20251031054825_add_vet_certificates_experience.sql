-- Nota: "IF NOT EXISTS" não é suportado após o nome da tabela no ALTER TABLE
-- Em vez disso, use em cada ADD COLUMN individualmente
ALTER TABLE vets
  ADD COLUMN IF NOT EXISTS certificates text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS experience text;

-- Ensure email exists (safety)
ALTER TABLE vets
  ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vets_email ON vets(email);
