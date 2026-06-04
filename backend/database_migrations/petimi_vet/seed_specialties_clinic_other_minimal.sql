-- Minimal specialties for demand categories `clinic` and `other`
-- (API: GET /specialties?category=clinic|other). Safe to re-run.
-- Run in Supabase SQL Editor for the project used by your backend.

INSERT INTO public.specialties (name, category, description, active, role) VALUES
  ('Parceria — Clínica geral', 'clinic', 'Serviços clínicos gerais entre clínicas parceiras', TRUE, 'clinic'),
  ('Parceria — Hospital / internação', 'clinic', 'Estrutura com internação e plantão', TRUE, 'clinic'),
  ('Parceria — Centro cirúrgico', 'clinic', 'Bloco cirúrgico e equipa dedicada', TRUE, 'clinic'),
  ('Outros — Consultoria', 'other', 'Consultoria técnica ou de gestão', TRUE, 'other'),
  ('Outros — Formação', 'other', 'Treino de equipas ou workshops', TRUE, 'other'),
  ('Outros — Apoio logístico', 'other', 'Apoio operacional não clínico', TRUE, 'other')
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  active = EXCLUDED.active,
  role = EXCLUDED.role;
