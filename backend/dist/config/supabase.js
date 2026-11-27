"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = exports.supabase = void 0;
exports.createAuthClient = createAuthClient;
const supabase_js_1 = require("@supabase/supabase-js");
require("./loadEnv");
// Client anon sem persistência — preferir createAuthClient() em login e
// supabaseAdmin.auth.getUser(jwt) na validação de Bearer (evita contaminação).
exports.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
/** Client anon efêmero por request (ex.: /auth/login). Não compartilha sessão em memória. */
function createAuthClient() {
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
// Admin client (service role key) - usado apenas no backend para operações administrativas
// IMPORTANTE: Nunca exponha esta chave no frontend!
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('🚨 Faltando SUPABASE_SERVICE_ROLE_KEY no .env — operações admin irão falhar.');
}
exports.supabaseAdmin = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, // 👈 só aceita a chave service
{
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
