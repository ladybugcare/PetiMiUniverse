"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelInvitation = exports.getPendingInvitations = exports.removeUser = exports.updateUserRole = exports.getUserClinicInfo = exports.getClinicUsers = exports.acceptInvitation = exports.inviteUser = void 0;
const supabase_1 = require("../config/supabase");
const authMiddleware_1 = require("../middleware/authMiddleware");
const auditLog_1 = require("../utils/auditLog");
const emailService_1 = require("../utils/emailService");
const permissions_1 = require("../utils/permissions");
const notificationsController_1 = require("./notificationsController");
// Invite new user
const inviteUser = async (req, res) => {
    const { email, clinic_id, unit_id, role } = req.body;
    const invited_by = req.user.id;
    try {
        // Verify permission
        const hasPermission = await (0, authMiddleware_1.checkPermission)(invited_by, clinic_id, 'user.invite');
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para convidar usuários' });
        }
        // Check if user already exists in this unit
        const { data: existingUser } = await supabase_1.supabase
            .from('clinic_users')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id);
        if (existingUser && existingUser.length > 0) {
            // Check if any user has this email
            for (const cu of existingUser) {
                const { data: userData } = await supabase_1.supabase
                    .from('auth.users')
                    .select('email')
                    .eq('id', cu.user_id)
                    .single();
                if (userData && userData.email === email) {
                    return res.status(400).json({ error: 'Usuário já está vinculado a esta unidade' });
                }
            }
        }
        // Check for pending invitation
        const { data: existingInvitation } = await supabase_1.supabase
            .from('user_invitations')
            .select('*')
            .eq('email', email)
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .eq('status', 'pending');
        if (existingInvitation && existingInvitation.length > 0) {
            return res.status(400).json({ error: 'Já existe um convite pendente para este email' });
        }
        // Generate token
        const token = (0, emailService_1.generateInvitationToken)();
        const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        // Create invitation
        const { data, error } = await supabase_1.supabase
            .from('user_invitations')
            .insert([
            {
                email,
                clinic_id,
                unit_id,
                role,
                invited_by,
                token,
                expires_at: expires_at.toISOString(),
            },
        ])
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        // Send invitation email
        await (0, emailService_1.sendInvitationEmail)(email, token, clinic_id, unit_id, (0, permissions_1.getRoleDisplayName)(role));
        // Get clinic and unit info for notification
        const { data: clinic } = await supabase_1.supabase
            .from('clinics')
            .select('name')
            .eq('id', clinic_id)
            .single();
        const { data: unit } = await supabase_1.supabase
            .from('units')
            .select('name')
            .eq('id', unit_id)
            .single();
        // Get user_id from email if user already exists (using Admin API)
        const { data: usersData } = await supabase_1.supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = usersData?.users?.find(user => user.email === email);
        // Create notification if user exists in the system
        if (existingAuthUser?.id && clinic && unit) {
            await (0, notificationsController_1.createNotification)({
                user_id: existingAuthUser.id,
                type: 'unit_invitation',
                title: 'Convite para Unidade',
                message: `Você foi convidado para a unidade "${unit.name}" da clínica "${clinic.name}" como ${(0, permissions_1.getRoleDisplayName)(role)}`,
                link: `/accept-invitation?token=${token}`,
                entity_type: 'invitation',
                entity_id: data[0].id,
            });
        }
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id: invited_by,
            clinic_id,
            unit_id,
            action: 'INVITE_USER',
            entity_type: 'invitation',
            entity_id: data[0].id,
            new_values: { email, role },
            ...metadata,
        });
        res.status(201).json({ invitation: data[0] });
    }
    catch (error) {
        console.error('Error inviting user:', error);
        res.status(500).json({ error: 'Erro ao convidar usuário' });
    }
};
exports.inviteUser = inviteUser;
// Accept invitation
const acceptInvitation = async (req, res) => {
    const { token } = req.body;
    const user_id = req.user.id;
    try {
        // Find invitation
        const { data: invitation, error } = await supabase_1.supabase
            .from('user_invitations')
            .select('*')
            .eq('token', token)
            .eq('status', 'pending')
            .single();
        if (error || !invitation) {
            return res.status(404).json({ error: 'Convite inválido ou expirado' });
        }
        // Check expiration
        if (new Date(invitation.expires_at) < new Date()) {
            await supabase_1.supabase
                .from('user_invitations')
                .update({ status: 'expired' })
                .eq('token', token);
            return res.status(400).json({ error: 'Convite expirado' });
        }
        // Create clinic_user relationship
        const { data: clinicUser, error: userError } = await supabase_1.supabase
            .from('clinic_users')
            .insert([
            {
                user_id,
                clinic_id: invitation.clinic_id,
                unit_id: invitation.unit_id,
                role: invitation.role,
                status: 'active',
                invited_by: invitation.invited_by,
                invited_at: invitation.created_at,
                accepted_at: new Date().toISOString(),
            },
        ])
            .select();
        if (userError)
            return res.status(400).json({ error: userError.message });
        // Update invitation status
        await supabase_1.supabase
            .from('user_invitations')
            .update({ status: 'accepted' })
            .eq('token', token);
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id: invitation.clinic_id,
            unit_id: invitation.unit_id,
            action: 'ACCEPT_INVITATION',
            entity_type: 'clinic_user',
            entity_id: clinicUser[0].id,
            new_values: clinicUser[0],
            ...metadata,
        });
        res.json({ clinic_user: clinicUser[0] });
    }
    catch (error) {
        console.error('Error accepting invitation:', error);
        res.status(500).json({ error: 'Erro ao aceitar convite' });
    }
};
exports.acceptInvitation = acceptInvitation;
// Get clinic users
const getClinicUsers = async (req, res) => {
    const { clinic_id, unit_id } = req.query;
    const user_id = req.user.id;
    try {
        if (!clinic_id) {
            return res.status(400).json({ error: 'clinic_id é obrigatório' });
        }
        // Verify clinic access
        const hasAccess = await (0, authMiddleware_1.checkClinicAccess)(user_id, clinic_id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        let query = supabase_1.supabase
            .from('clinic_users')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('status', 'active');
        if (unit_id) {
            query = query.eq('unit_id', unit_id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error)
            return res.status(400).json({ error: error.message });
        // Fetch user emails in batch using Supabase Admin API
        const userIds = (data || []).map(cu => cu.user_id);
        const userEmailMap = new Map();
        if (userIds.length > 0) {
            try {
                // Fetch all users in one call
                const { data: usersData, error: usersError } = await supabase_1.supabaseAdmin.auth.admin.listUsers();
                if (!usersError && usersData?.users) {
                    usersData.users.forEach(user => {
                        if (userIds.includes(user.id)) {
                            userEmailMap.set(user.id, user.email || '');
                        }
                    });
                }
            }
            catch (err) {
                console.error('Error fetching users in batch:', err);
            }
        }
        // Map clinic users with emails
        const clinicUsersWithEmail = (data || []).map(clinicUser => ({
            ...clinicUser,
            user: userEmailMap.has(clinicUser.user_id) ? {
                id: clinicUser.user_id,
                email: userEmailMap.get(clinicUser.user_id) || '',
            } : null,
        }));
        res.json({ clinic_users: clinicUsersWithEmail });
    }
    catch (error) {
        console.error('Error fetching clinic users:', error);
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
};
exports.getClinicUsers = getClinicUsers;
// Get user's clinic info
const getUserClinicInfo = async (req, res) => {
    const user_id = req.user.id;
    const { clinic_id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinic_users')
            .select(`
        *,
        clinic:clinic_id (*),
        unit:unit_id (*)
      `)
            .eq('user_id', user_id)
            .eq('clinic_id', clinic_id)
            .eq('status', 'active')
            .single();
        if (error)
            return res.status(404).json({ error: 'Vínculo não encontrado' });
        res.json({ clinic_user: data });
    }
    catch (error) {
        console.error('Error fetching user clinic info:', error);
        res.status(500).json({ error: 'Erro ao buscar informações' });
    }
};
exports.getUserClinicInfo = getUserClinicInfo;
// Update user role
const updateUserRole = async (req, res) => {
    const { clinic_user_id } = req.params;
    const { role } = req.body;
    const user_id = req.user.id;
    try {
        // Get current clinic user
        const { data: currentClinicUser, error: fetchError } = await supabase_1.supabase
            .from('clinic_users')
            .select('*')
            .eq('id', clinic_user_id)
            .single();
        if (fetchError) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        // Verify permission
        const hasPermission = await (0, authMiddleware_1.checkPermission)(user_id, currentClinicUser.clinic_id, 'user.edit');
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para editar usuários' });
        }
        // Update role
        const { data, error } = await supabase_1.supabase
            .from('clinic_users')
            .update({
            role,
            updated_at: new Date().toISOString(),
        })
            .eq('id', clinic_user_id)
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id: currentClinicUser.clinic_id,
            unit_id: currentClinicUser.unit_id,
            action: 'UPDATE_USER_ROLE',
            entity_type: 'clinic_user',
            entity_id: clinic_user_id,
            old_values: { role: currentClinicUser.role },
            new_values: { role },
            ...metadata,
        });
        res.json({ clinic_user: data[0] });
    }
    catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: 'Erro ao atualizar role' });
    }
};
exports.updateUserRole = updateUserRole;
// Remove user (soft delete)
const removeUser = async (req, res) => {
    const { clinic_user_id } = req.params;
    const user_id = req.user.id;
    try {
        // Get current clinic user
        const { data: currentClinicUser, error: fetchError } = await supabase_1.supabase
            .from('clinic_users')
            .select('*')
            .eq('id', clinic_user_id)
            .single();
        if (fetchError) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        // Verify permission
        const hasPermission = await (0, authMiddleware_1.checkPermission)(user_id, currentClinicUser.clinic_id, 'user.delete');
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para remover usuários' });
        }
        // Soft delete
        const { data, error } = await supabase_1.supabase
            .from('clinic_users')
            .update({
            status: 'inactive',
            updated_at: new Date().toISOString(),
        })
            .eq('id', clinic_user_id)
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id: currentClinicUser.clinic_id,
            unit_id: currentClinicUser.unit_id,
            action: 'REMOVE_USER',
            entity_type: 'clinic_user',
            entity_id: clinic_user_id,
            old_values: currentClinicUser,
            new_values: data[0],
            ...metadata,
        });
        res.json({ message: 'Usuário removido com sucesso', clinic_user: data[0] });
    }
    catch (error) {
        console.error('Error removing user:', error);
        res.status(500).json({ error: 'Erro ao remover usuário' });
    }
};
exports.removeUser = removeUser;
// Get pending invitations
const getPendingInvitations = async (req, res) => {
    const { clinic_id } = req.query;
    const user_id = req.user.id;
    try {
        if (!clinic_id) {
            return res.status(400).json({ error: 'clinic_id é obrigatório' });
        }
        // Verify clinic access
        const hasAccess = await (0, authMiddleware_1.checkClinicAccess)(user_id, clinic_id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const { data, error } = await supabase_1.supabase
            .from('user_invitations')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error)
            return res.status(400).json({ error: error.message });
        res.json({ invitations: data });
    }
    catch (error) {
        console.error('Error fetching invitations:', error);
        res.status(500).json({ error: 'Erro ao buscar convites' });
    }
};
exports.getPendingInvitations = getPendingInvitations;
// Cancel invitation
const cancelInvitation = async (req, res) => {
    const { invitation_id } = req.params;
    const user_id = req.user.id;
    try {
        // Get invitation
        const { data: invitation, error: fetchError } = await supabase_1.supabase
            .from('user_invitations')
            .select('*')
            .eq('id', invitation_id)
            .single();
        if (fetchError) {
            return res.status(404).json({ error: 'Convite não encontrado' });
        }
        // Verify permission
        const hasPermission = await (0, authMiddleware_1.checkPermission)(user_id, invitation.clinic_id, 'user.invite');
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para cancelar convites' });
        }
        // Cancel invitation
        const { data, error } = await supabase_1.supabase
            .from('user_invitations')
            .update({ status: 'cancelled' })
            .eq('id', invitation_id)
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id: invitation.clinic_id,
            unit_id: invitation.unit_id,
            action: 'CANCEL_INVITATION',
            entity_type: 'invitation',
            entity_id: invitation_id,
            old_values: invitation,
            new_values: data[0],
            ...metadata,
        });
        res.json({ message: 'Convite cancelado com sucesso', invitation: data[0] });
    }
    catch (error) {
        console.error('Error canceling invitation:', error);
        res.status(500).json({ error: 'Erro ao cancelar convite' });
    }
};
exports.cancelInvitation = cancelInvitation;
