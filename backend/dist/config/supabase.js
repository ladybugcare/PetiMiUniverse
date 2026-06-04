"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
require("./loadEnv");
// Client padrão (anon key) - usado para operações do usuário autenticado
exports.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY);
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
