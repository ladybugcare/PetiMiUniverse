/** Erros do PostgREST/Supabase quando tabela/coluna ainda não existe no schema cache. */
export function isMissingPostgrestRelation(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('could not find the table') ||
    msg.includes('could not find the') ||
    msg.includes('schema cache') ||
    error.code === 'PGRST205'
  );
}

export const CLINICAL_ATTACHMENTS_MIGRATION_HINT =
  'Execute no Supabase SQL Editor o ficheiro backend/database_migrations/petimi_hub/create_hub_clinical_attachments.sql (bloco 25 do README) e depois NOTIFY pgrst, \'reload schema\';';
