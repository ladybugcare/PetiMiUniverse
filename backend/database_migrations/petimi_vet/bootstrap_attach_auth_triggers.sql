-- ========================================
-- Bootstrap: attach auth.users triggers
-- Run AFTER:
--   - supabase/migrations/petivet_prod_structure.sql
--   - supabase/migrations/20251108184400_update_vet_trigger_with_document_fields.sql
--   - supabase/migrations/20251108184733_fix_vet_trigger_experience_field.sql
-- Do NOT run backend/database_migrations/create_auth_triggers.sql after the above:
-- it would replace handle_new_user with an older definition.
-- ========================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_delete();

SELECT 'bootstrap_attach_auth_triggers.sql OK' AS status;
