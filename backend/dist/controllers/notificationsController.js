"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyProfessionalsByCategory = exports.updateNotificationPrefs = exports.getNotificationPrefs = exports.clearReadNotifications = exports.deleteNotification = exports.markAllAsRead = exports.markAsRead = exports.getUnreadCount = exports.getNotifications = exports.createNotification = void 0;
const supabase_1 = require("../config/supabase");
const hubNotificationPrefs_1 = require("../modules/hub/hubNotificationPrefs");
// O banco é compartilhado por todos os produtos e `notifications` é acessada com service role:
// cada rota só pode ler/alterar notificações do próprio usuário autenticado.
const isOwnUser = (req, userId) => typeof userId === 'string' && userId === req.user?.id;
// ========================================
// HELPER: Criar Notificação (usado internamente)
// ========================================
const createNotification = async (data) => {
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .insert([{
                user_id: data.user_id,
                type: data.type,
                title: data.title,
                message: data.message,
                link: data.link || null,
                entity_type: data.entity_type || null,
                entity_id: data.entity_id || null,
                read: false
            }]);
        if (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }
    catch (error) {
        console.error('Failed to create notification:', error);
        // Não lançar erro para não quebrar o fluxo principal
    }
};
exports.createNotification = createNotification;
// ========================================
// GET /notifications - Buscar notificações do usuário
// ========================================
const getNotifications = async (req, res) => {
    const { user_id, page = '1', limit = '20', unread_only } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }
    if (!isOwnUser(req, user_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        // Build query
        let query = supabase_1.supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('user_id', user_id);
        // Filter by read status if requested
        if (unread_only === 'true') {
            query = query.eq('read', false);
        }
        // Apply pagination and ordering
        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNum - 1);
        if (error)
            throw error;
        res.json({
            notifications: data || [],
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limitNum)
            }
        });
    }
    catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ error: error.message || 'Failed to get notifications' });
    }
};
exports.getNotifications = getNotifications;
// ========================================
// GET /notifications/unread-count - Contar notificações não lidas
// ========================================
const getUnreadCount = async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }
    if (!isOwnUser(req, user_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const { count, error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user_id)
            .eq('read', false);
        if (error)
            throw error;
        res.json({ unread_count: count || 0 });
    }
    catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({ error: error.message || 'Failed to get unread count' });
    }
};
exports.getUnreadCount = getUnreadCount;
// ========================================
// PUT /notifications/:id/read - Marcar notificação como lida
// ========================================
const markAsRead = async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ error: 'Notification ID is required' });
    }
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .update({ read: true })
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();
        if (error)
            throw error;
        res.json({ notification: data });
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
    }
};
exports.markAsRead = markAsRead;
// ========================================
// PUT /notifications/read-all - Marcar todas como lidas
// ========================================
const markAllAsRead = async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }
    if (!isOwnUser(req, user_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .update({ read: true })
            .eq('user_id', user_id)
            .eq('read', false);
        if (error)
            throw error;
        res.json({ message: 'All notifications marked as read' });
    }
    catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: error.message || 'Failed to mark all notifications as read' });
    }
};
exports.markAllAsRead = markAllAsRead;
// ========================================
// DELETE /notifications/:id - Deletar notificação
// ========================================
const deleteNotification = async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ error: 'Notification ID is required' });
    }
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);
        if (error)
            throw error;
        res.json({ message: 'Notification deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: error.message || 'Failed to delete notification' });
    }
};
exports.deleteNotification = deleteNotification;
// ========================================
// DELETE /notifications/clear-read - Limpar notificações lidas
// ========================================
const clearReadNotifications = async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }
    if (!isOwnUser(req, user_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .delete()
            .eq('user_id', user_id)
            .eq('read', true);
        if (error)
            throw error;
        res.json({ message: 'Read notifications cleared successfully' });
    }
    catch (error) {
        console.error('Error clearing read notifications:', error);
        res.status(500).json({ error: error.message || 'Failed to clear read notifications' });
    }
};
exports.clearReadNotifications = clearReadNotifications;
// ========================================
// GET /notifications/prefs — Preferências Hub (Meu perfil)
// ========================================
const getNotificationPrefs = async (req, res) => {
    const clinicId = String(req.query.clinic_id ?? '').trim();
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!clinicId) {
        return res.status(400).json({ error: 'clinic_id is required' });
    }
    try {
        const allowed = await (0, hubNotificationPrefs_1.userBelongsToClinic)(userId, clinicId);
        if (!allowed) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const categories = await (0, hubNotificationPrefs_1.getHubNotificationPrefsForUser)(userId, clinicId);
        res.json({ clinic_id: clinicId, categories });
    }
    catch (error) {
        console.error('Error getting notification prefs:', error);
        res.status(500).json({ error: error.message || 'Failed to get notification prefs' });
    }
};
exports.getNotificationPrefs = getNotificationPrefs;
// ========================================
// PUT /notifications/prefs — Salvar preferências Hub
// ========================================
const updateNotificationPrefs = async (req, res) => {
    const userId = req.user?.id;
    const clinicId = String(req.body?.clinic_id ?? '').trim();
    const rawCategories = req.body?.categories;
    if (!userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!clinicId) {
        return res.status(400).json({ error: 'clinic_id is required' });
    }
    if (!rawCategories || typeof rawCategories !== 'object') {
        return res.status(400).json({ error: 'categories is required' });
    }
    try {
        const allowed = await (0, hubNotificationPrefs_1.userBelongsToClinic)(userId, clinicId);
        if (!allowed) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const next = (0, hubNotificationPrefs_1.defaultHubNotificationPrefs)();
        for (const key of hubNotificationPrefs_1.HUB_NOTIFICATION_PREF_CATEGORIES) {
            if (!Object.prototype.hasOwnProperty.call(rawCategories, key))
                continue;
            if (!(0, hubNotificationPrefs_1.isHubNotificationPrefCategory)(key))
                continue;
            next[key] = Boolean(rawCategories[key]);
        }
        const categories = await (0, hubNotificationPrefs_1.upsertHubNotificationPrefs)(userId, clinicId, next);
        res.json({ clinic_id: clinicId, categories });
    }
    catch (error) {
        console.error('Error updating notification prefs:', error);
        res.status(500).json({ error: error.message || 'Failed to update notification prefs' });
    }
};
exports.updateNotificationPrefs = updateNotificationPrefs;
// ========================================
// HELPER: Notificar profissionais por categoria
// ========================================
/**
 * Notifica profissionais ativos de uma categoria específica sobre nova demanda
 * @param category Categoria da demanda ('vet', 'freelancer', 'clinic', 'other')
 * @param demandId ID da demanda criada
 * @param clinicName Nome da clínica que criou a demanda
 * @param demandTitle Título da demanda
 */
const notifyProfessionalsByCategory = async (category, demandId, clinicName, demandTitle) => {
    try {
        let professionals = [];
        // Buscar profissionais ativos baseado na categoria
        if (category === 'vet') {
            const { data: vets, error: vetsError } = await supabase_1.supabaseAdmin
                .from('vets')
                .select('id')
                .eq('status', 'active');
            if (vetsError) {
                console.error('Error fetching vets for notification:', vetsError);
                return; // Não falhar a criação da demanda
            }
            professionals = vets || [];
        }
        else if (category === 'freelancer') {
            const { data: freelancers, error: freelancersError } = await supabase_1.supabaseAdmin
                .from('freelancers')
                .select('id')
                .eq('status', 'active');
            if (freelancersError) {
                console.error('Error fetching freelancers for notification:', freelancersError);
                return; // Não falhar a criação da demanda
            }
            professionals = freelancers || [];
        }
        else if (category === 'clinic') {
            // Para clínicas, buscar clínicas ativas (se aplicável)
            // Por enquanto, não notificar outras clínicas sobre demandas de clínicas
            // Isso pode ser implementado no futuro se necessário
            return;
        }
        else if (category === 'other') {
            // Para "other", buscar vets e freelancers ativos
            const [vetsResult, freelancersResult] = await Promise.all([
                supabase_1.supabaseAdmin.from('vets').select('id').eq('status', 'active'),
                supabase_1.supabaseAdmin.from('freelancers').select('id').eq('status', 'active'),
            ]);
            if (vetsResult.error) {
                console.error('Error fetching vets for notification:', vetsResult.error);
            }
            if (freelancersResult.error) {
                console.error('Error fetching freelancers for notification:', freelancersResult.error);
            }
            const vets = vetsResult.data || [];
            const freelancers = freelancersResult.data || [];
            professionals = [...vets, ...freelancers];
        }
        else {
            console.warn(`Unknown category for notification: ${category}`);
            return;
        }
        // Criar notificações para todos os profissionais encontrados
        if (professionals.length > 0) {
            const notificationPromises = professionals.map((professional) => (0, exports.createNotification)({
                user_id: professional.id,
                type: 'new_demand_created',
                title: 'Nova Oportunidade de Trabalho',
                message: `Nova vaga disponível: "${demandTitle}" na ${clinicName}`,
                link: `/demands/${demandId}`,
                entity_type: 'demand',
                entity_id: demandId,
            }));
            // Executar todas as notificações em paralelo (não esperar ou falhar a criação)
            Promise.all(notificationPromises).catch((err) => {
                console.error('Error sending new demand notifications:', err);
                // Não lançar erro para não quebrar o fluxo principal
            });
        }
    }
    catch (error) {
        console.error('Error in notifyProfessionalsByCategory:', error);
        // Não lançar erro para não quebrar a criação da demanda
    }
};
exports.notifyProfessionalsByCategory = notifyProfessionalsByCategory;
