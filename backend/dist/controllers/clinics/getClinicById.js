"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClinicById = void 0;
const supabase_1 = require("../../config/supabase");
const authMiddleware_1 = require("../../middleware/authMiddleware");
/** Utilizador autenticado via Bearer (Hub / painel clínica). */
async function resolveAuthUserId(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return null;
    const token = authHeader.split(' ')[1];
    const { data: { user }, error, } = await supabase_1.supabase.auth.getUser(token);
    if (error || !user)
        return null;
    return user.id;
}
const getClinicById = async (req, res) => {
    const { id } = req.params;
    try {
        const userId = await resolveAuthUserId(req);
        // Sessão Hub: RLS do client anon costuma bloquear — usar service role após validar acesso
        if (userId) {
            const hasAccess = await (0, authMiddleware_1.checkClinicAccess)(userId, id);
            if (!hasAccess) {
                return res.status(403).json({ error: 'Acesso negado' });
            }
            const { data, error } = await supabase_1.supabaseAdmin
                .from('clinics')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (error) {
                console.error('Erro ao buscar clínica (admin):', error);
                return res.status(500).json({ error: 'Erro ao buscar clínica' });
            }
            if (!data) {
                return res.status(404).json({ error: 'Clínica não encontrada' });
            }
            return res.json({ clinic: data });
        }
        // Leitura pública (marketplace / sem token) — sujeita a RLS
        const { data, error } = await supabase_1.supabase.from('clinics').select('*').eq('id', id).maybeSingle();
        if (error) {
            console.error('Erro ao buscar clínica:', error);
            return res.status(500).json({ error: 'Erro ao buscar clínica' });
        }
        if (!data) {
            return res.status(404).json({ error: 'Clínica não encontrada' });
        }
        return res.json({ clinic: data });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.getClinicById = getClinicById;
