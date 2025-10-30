"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireClinicAccess = exports.requirePermission = exports.checkClinicAccess = exports.checkPermission = exports.authenticateUser = void 0;
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
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }
        // Attach user to request
        req.user = {
            id: user.id,
            email: user.email,
            role: user.user_metadata?.role,
        };
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
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
