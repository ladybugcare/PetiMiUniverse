"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLINICAL_ATTACHMENTS_MIGRATION_HINT = void 0;
exports.isMissingPostgrestRelation = isMissingPostgrestRelation;
/** Erros do PostgREST/Supabase quando tabela/coluna ainda não existe no schema cache. */
function isMissingPostgrestRelation(error) {
    if (!error?.message)
        return false;
    const msg = error.message.toLowerCase();
    return (msg.includes('could not find the table') ||
        msg.includes('could not find the') ||
        msg.includes('schema cache') ||
        error.code === 'PGRST205');
}
exports.CLINICAL_ATTACHMENTS_MIGRATION_HINT = 'Execute no Supabase SQL Editor o ficheiro backend/database_migrations/petimi_hub/create_hub_clinical_attachments.sql (bloco 25 do README) e depois NOTIFY pgrst, \'reload schema\';';
