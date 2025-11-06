"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAdmin = exports.requireClinicAccess = exports.requirePermission = exports.checkClinicAccess = exports.checkPermission = exports.authenticateUser = void 0;
const supabase_1 = require("../config/supabase");
const permissions_1 = require("../utils/permissions");
// Authenticate user from session token
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido' });
        }
        const token = authHeader.split(' ')[1];
        // Verify token with Supabase
        const { data: { user }, error, } = await supabase_1.supabase.auth.getUser(token);
        if (error || !user) {
            // Log detalhado para debug (apenas em desenvolvimento)
            if (process.env.NODE_ENV === 'development') {
                console.error('Token validation error:', {
                    error: error?.message,
                    errorCode: error?.status,
                    supabaseUrl: process.env.SUPABASE_URL?.substring(0, 30) + '...',
                    tokenPreview: token.substring(0, 20) + '...',
                });
            }
            // Mensagem mais detalhada se for erro de configuração
            if (error?.message?.includes('Invalid API key') || error?.message?.includes('JWT')) {
                return res.status(401).json({
                    error: 'Token inválido. Verifique se frontend e backend usam o mesmo projeto Supabase.',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }
        // Attach user to request
        // O role está em user_metadata
        const role = user.user_metadata?.role;
        // Debug: log role para verificar
        if (!role) {
            console.warn('Warning: User role not found for user:', user.id, 'email:', user.email);
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: role,
        };
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        // Detectar problemas de configuração do Supabase
        if (error?.message?.includes('Invalid API key') || error?.message?.includes('SUPABASE')) {
            return res.status(500).json({
                error: 'Erro de configuração do Supabase. Verifique se SUPABASE_URL e SUPABASE_KEY estão corretos.',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
        return res.status(500).json({ error: 'Erro na autenticação' });
    }
};
exports.authenticateUser = authenticateUser;
// Check if user has permission
const checkPermission = async (user_id, clinic_id, permission) => {
    try {
        // Buscar role do usuário na clínica
        const { data: clinicUser, error } = await supabase_1.supabase
            .from('clinic_users')
            .select('role')
            .eq('user_id', user_id)
            .eq('clinic_id', clinic_id)
            .eq('status', 'active')
            .single();
        if (error || !clinicUser) {
            return false;
        }
        // Verificar se role tem a permissão
        const userPermissions = permissions_1.PERMISSIONS[clinicUser.role];
        return userPermissions ? userPermissions.includes(permission) : false;
    }
    catch (error) {
        console.error('Error checking permission:', error);
        return false;
    }
};
exports.checkPermission = checkPermission;
// Check if user has access to clinic
const checkClinicAccess = async (user_id, clinic_id) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinic_users')
            .select('id')
            .eq('user_id', user_id)
            .eq('clinic_id', clinic_id)
            .eq('status', 'active')
            .single();
        return !error && !!data;
    }
    catch (error) {
        console.error('Error checking clinic access:', error);
        return false;
    }
};
exports.checkClinicAccess = checkClinicAccess;
// Middleware to require specific permission
const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            const user_id = req.user?.id;
            if (!user_id) {
                return res.status(401).json({ error: 'Usuário não autenticado' });
            }
            // Extract clinic_id from various sources
            const clinic_id = req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;
            if (!clinic_id) {
                return res.status(400).json({ error: 'clinic_id não fornecido' });
            }
            const hasPermission = await (0, exports.checkPermission)(user_id, clinic_id, permission);
            if (!hasPermission) {
                return res.status(403).json({ error: 'Permissão negada' });
            }
            next();
        }
        catch (error) {
            console.error('Permission check error:', error);
            return res.status(500).json({ error: 'Erro ao verificar permissões' });
        }
    };
};
exports.requirePermission = requirePermission;
// Middleware to require clinic access
const requireClinicAccess = async (req, res, next) => {
    try {
        const user_id = req.user?.id;
        if (!user_id) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        const clinic_id = req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;
        if (!clinic_id) {
            return res.status(400).json({ error: 'clinic_id não fornecido' });
        }
        const hasAccess = await (0, exports.checkClinicAccess)(user_id, clinic_id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        next();
    }
    catch (error) {
        console.error('Clinic access check error:', error);
        return res.status(500).json({ error: 'Erro ao verificar acesso' });
    }
};
exports.requireClinicAccess = requireClinicAccess;
// ✅ Middleware para garantir que o usuário logado é um admin
const verifyAdmin = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const userRole = user.role?.toLowerCase();
    if (userRole !== 'admin') {
        return res
            .status(403)
            .json({ error: 'Acesso negado. Somente administradores podem executar esta ação.' });
    }
    next();
};
exports.verifyAdmin = verifyAdmin;
