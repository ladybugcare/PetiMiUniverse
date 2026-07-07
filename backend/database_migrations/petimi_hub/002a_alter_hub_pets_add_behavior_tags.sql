-- Tags de comportamento do pet (questionário do wizard / ficha clínica)
ALTER TABLE hub_pets
  ADD COLUMN IF NOT EXISTS behavior_tags text[] NOT NULL DEFAULT '{}';
