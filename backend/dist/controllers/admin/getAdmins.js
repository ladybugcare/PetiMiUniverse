"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdmins = void 0;
const supabase_1 = require("../../config/supabase");
const auditLog_1 = require("../../utils/auditLog");
/**
 * Controller para listar administradores ativos e inativos.
 * Usa Admin API do Supabase para listar usuários e filtra por role.
 */
const getAdmins = async (req, res) => {
    try {
        const requesterRole = req.user?.role?.toLowerCase();
        if (requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        // Verificar se SUPABASE_SERVICE_ROLE_KEY está configurado
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('🚨 SUPABASE_SERVICE_ROLE_KEY não configurado');
            return res.status(500).json({
                error: 'Erro ao listar administradores: Configuração do Supabase incompleta',
                details: process.env.NODE_ENV === 'development' ? 'SUPABASE_SERVICE_ROLE_KEY não encontrado' : undefined
            });
        }
        // Tentar usar Admin API com paginação para evitar problemas
        let allUsers = [];
        let page = 1;
        const perPage = 1000;
        let hasMore = true;
        while (hasMore) {
            try {
                const { data: usersData, error: usersError } = await supabase_1.supabaseAdmin.auth.admin.listUsers({
                    page,
                    perPage,
                });
                if (usersError) {
                    console.error(`Erro ao listar administradores (página ${page}):`, usersError);
                    // Se for erro de database, tentar abordagem alternativa
                    if (usersError.message?.includes('Database error')) {
                        console.warn('Admin API falhou com Database error, tentando continuar...');
                        // Não retornar vazio imediatamente, tentar continuar
                        hasMore = false;
                        break;
                    }
                    throw usersError;
                }
                if (usersData?.users && usersData.users.length > 0) {
                    allUsers = allUsers.concat(usersData.users);
                    hasMore = usersData.users.length === perPage;
                    page++;
                }
                else {
                    hasMore = false;
                }
            }
            catch (apiError) {
                console.error('Erro na Admin API:', apiError);
                // Se a Admin API falhar completamente, tentar retornar o que temos
                if (apiError.message?.includes('Database error')) {
                    console.warn('Admin API com erro de database, usando dados já coletados');
                    hasMore = false;
                    break;
                }
                throw apiError;
            }
        }
        // Log para debug
        console.log(`[getAdmins] Total de usuários encontrados: ${allUsers.length}`);
        // Filtrar apenas admins - verificar múltiplas fontes de role
        const admins = allUsers
            .filter((user) => {
            // Verificar user_metadata primeiro (formato mais comum)
            const roleFromMetadata = user.user_metadata?.role;
            // Verificar raw_user_meta_data como fallback
            const roleFromRaw = user.raw_user_meta_data?.role;
            // Verificar app_metadata também
            const roleFromApp = user.app_metadata?.role;
            const role = roleFromMetadata || roleFromRaw || roleFromApp;
            // Log para debug se encontrar usuário com role
            if (role) {
                console.log(`[getAdmins] Usuário encontrado com role: ${role}`, {
                    email: user.email,
                    id: user.id,
                    user_metadata: user.user_metadata,
                    raw_user_meta_data: user.raw_user_meta_data
                });
            }
            return role === 'admin';
        })
            .map((user) => {
            const metadata = user.user_metadata || user.raw_user_meta_data || {};
            return {
                id: user.id,
                name: metadata.name || user.email?.split('@')[0] || 'Sem nome',
                email: user.email || '',
                status: metadata.status || 'active',
                created_at: user.created_at || new Date().toISOString(),
                last_sign_in_at: user.last_sign_in_at || null,
            };
        });
        console.log(`[getAdmins] Total de admins encontrados: ${admins.length}`);
        // Tentar criar audit log, mas não falhar se der erro
        try {
            const metadata = (0, auditLog_1.extractRequestMetadata)(req);
            await (0, auditLog_1.createAuditLog)({
                user_id: req.user?.id || 'system',
                action: 'LIST_ADMINS',
                entity_type: 'admin',
                // entity_id não é necessário para operações bulk (listagem)
                new_values: { count: admins.length },
                ...metadata,
            });
        }
        catch (auditError) {
            console.warn('Erro ao criar audit log (não crítico):', auditError?.message);
            // Não falhar a requisição por causa do audit log
        }
        return res.status(200).json({ admins });
    }
    catch (error) {
        console.error('Erro inesperado ao buscar administradores:', error);
        return res.status(500).json({
            error: error.message || 'Erro inesperado ao listar administradores',
        });
    }
};
exports.getAdmins = getAdmins;
