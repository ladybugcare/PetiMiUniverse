"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerClinicWithUnit = exports.deleteClinic = exports.updateClinicPhoto = exports.updateClinic = exports.getClinicById = exports.checkEmail = exports.checkCNPJ = exports.getClinics = exports.createClinic = void 0;
const supabase_1 = require("../config/supabase");
const cnpjUtils_1 = require("../utils/cnpjUtils");
const createClinic = async (req, res) => {
    const { name, cnpj, address, email, password } = req.body;
    try {
        console.log('Creating clinic with email:', email);
        // Build redirect URL strictly from env; never fallback to localhost in staging/prod
        const rawFrontendUrl = process.env.FRONTEND_URL?.trim();
        const FRONTEND_URL = rawFrontendUrl?.replace(/\/$/, '');
        if (!FRONTEND_URL) {
            console.error('[SIGNUP] FRONTEND_URL not set. Aborting to avoid wrong redirect.');
            return res.status(500).json({ error: 'FRONTEND_URL não configurada no servidor' });
        }
        const emailRedirectTo = `${FRONTEND_URL}/email-confirmed`;
        console.log('[SIGNUP] Using emailRedirectTo:', emailRedirectTo);
        // 1. Create user in Supabase Auth first
        const { data: authData, error: authError } = await supabase_1.supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    role: 'clinic'
                },
                emailRedirectTo
            }
        });
        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({ error: authError.message });
        }
        if (!authData.user) {
            console.error('No user data returned from signup');
            return res.status(400).json({ error: 'Failed to create user' });
        }
        console.log('Auth user created:', authData.user.id);
        // Ensure email is sent in local/dev even if autoconfirm is enabled
        if (process.env.NODE_ENV !== 'production') {
            try {
                await supabase_1.supabase.auth.resend({ type: 'signup', email });
                console.log('[SIGNUP] Resend confirmation email invoked (dev)');
            }
            catch (e) {
                console.warn('[SIGNUP] Resend confirmation email failed (non-fatal):', e?.message);
            }
        }
        // 2. Check if clinic profile already exists (in case of retry)
        const { data: existingClinic, error: checkError } = await supabase_1.supabase
            .from('clinics')
            .select('id')
            .eq('id', authData.user.id)
            .maybeSingle();
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking existing clinic:', checkError);
        }
        let data;
        if (existingClinic) {
            // Update existing clinic profile
            console.log('Clinic profile already exists, updating...');
            const { data: updatedData, error: updateError } = await supabase_1.supabase
                .from('clinics')
                .update({
                name,
                cnpj,
                address,
                email
            })
                .eq('id', authData.user.id)
                .select();
            if (updateError) {
                console.error('Profile update error:', updateError);
                return res.status(400).json({ error: updateError.message || JSON.stringify(updateError) });
            }
            data = updatedData;
        }
        else {
            // Create new clinic profile
            const { data: insertedData, error: insertError } = await supabase_1.supabase
                .from('clinics')
                .insert([{
                    id: authData.user.id, // Link to auth user
                    name,
                    cnpj,
                    address,
                    email
                    // NO PASSWORD HERE - it's stored securely in auth.users
                }])
                .select();
            if (insertError) {
                console.error('Profile creation error:', insertError);
                return res.status(400).json({ error: insertError.message || JSON.stringify(insertError) });
            }
            data = insertedData;
        }
        console.log('Clinic profile created/updated successfully');
        res.status(201).json({
            clinic: data[0],
            user: authData.user,
            session: authData.session
        });
    }
    catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
exports.createClinic = createClinic;
const getClinics = async (_req, res) => {
    const { data, error } = await supabase_1.supabase.from('clinics').select('*');
    if (error)
        return res.status(400).json({ error });
    res.json({ clinics: data });
};
exports.getClinics = getClinics;
// Check if CNPJ already exists
const checkCNPJ = async (req, res) => {
    const { cnpj } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .select('cnpj')
            .eq('cnpj', cnpj)
            .limit(1);
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        res.json({ exists: data && data.length > 0 });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.checkCNPJ = checkCNPJ;
// Check if email already exists
const checkEmail = async (req, res) => {
    const { email } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .select('email')
            .eq('email', email)
            .limit(1);
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        res.json({ exists: data && data.length > 0 });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.checkEmail = checkEmail;
// Get clinic by ID
const getClinicById = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .select('*')
            .eq('id', id)
            .single();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        res.json({ clinic: data });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getClinicById = getClinicById;
// Update clinic
const updateClinic = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        // Remove fields that shouldn't be updated
        delete updates.id;
        delete updates.created_at;
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .update(updates)
            .eq('id', id)
            .select();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Clinic not found' });
        }
        res.json({ clinic: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateClinic = updateClinic;
// Update clinic photo
const updateClinicPhoto = async (req, res) => {
    const { id } = req.params;
    const { photo_url } = req.body;
    try {
        if (!photo_url) {
            return res.status(400).json({ error: 'photo_url is required' });
        }
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .update({ photo_url })
            .eq('id', id)
            .select();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Clinic not found' });
        }
        res.json({ clinic: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateClinicPhoto = updateClinicPhoto;
// Deactivate clinic (soft delete)
const deleteClinic = async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const isSystemAdmin = user.role === 'admin';
    const isClinicOwner = user.role === 'clinic' && user.id === id;
    if (!isSystemAdmin && !isClinicOwner) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    const timestamp = new Date().toISOString();
    try {
        const { data: clinic, error } = await supabase_1.supabaseAdmin
            .from('clinics')
            .update({
            status: 'inactive',
            deleted_at: timestamp,
            updated_at: timestamp,
        })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        if (!clinic) {
            return res.status(404).json({ error: 'Clinic not found' });
        }
        // Inativar todos os vínculos e unidades da clínica
        await supabase_1.supabaseAdmin
            .from('clinic_users')
            .update({ status: 'inactive', updated_at: timestamp })
            .eq('clinic_id', id);
        await supabase_1.supabaseAdmin
            .from('units')
            .update({ status: 'inactive', updated_at: timestamp })
            .eq('clinic_id', id);
        // Atualizar metadados e banir o usuário no Auth para impedir novos logins
        try {
            const { data: authUser, error: authUserError } = await supabase_1.supabaseAdmin.auth.admin.getUserById(id);
            if (!authUserError && authUser?.user) {
                const existingMetadata = authUser.user.user_metadata || {};
                const mergedMetadata = {
                    ...existingMetadata,
                    status: 'inactive',
                };
                await supabase_1.supabaseAdmin.auth.admin.updateUserById(id, {
                    ban_duration: 'forever',
                    user_metadata: mergedMetadata,
                });
            }
        }
        catch (authUpdateError) {
            console.error('Failed to update auth user during clinic deactivation:', authUpdateError);
        }
        res.json({ message: 'Clinic deactivated successfully', clinic });
    }
    catch (error) {
        console.error('Error deactivating clinic:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.deleteClinic = deleteClinic;
// Register clinic with first unit (unified endpoint)
// ✅ NOVO FLUXO: Verifica clinic_user com clinic_id NULL, cria clinic primeiro, depois cria unit e atualiza clinic_user
const registerClinicWithUnit = async (req, res) => {
    const { clinic, unit } = req.body;
    const user_id = req.user?.id;
    try {
        if (!user_id) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        // ✅ 1. Verificar clinic_user (deve existir com clinic_id = NULL e status = 'pending_clinic')
        const { data: clinicUser, error: clinicUserError } = await supabase_1.supabase
            .from('clinic_users')
            .select('id, role, clinic_id, status')
            .eq('user_id', user_id)
            .eq('role', 'CADMIN')
            .maybeSingle();
        if (clinicUserError || !clinicUser) {
            return res.status(403).json({ error: 'Usuário não encontrado ou sem permissão' });
        }
        // Se clinic_id já existe, significa que já tem clínica
        if (clinicUser.clinic_id) {
            // Se já tem clínica, pode atualizar ou criar nova unidade normalmente
            // Mas não é o fluxo de primeira unidade
            if (!unit) {
                return res.status(400).json({ error: 'Clínica já existe. Use o endpoint de criação de unidade normal.' });
            }
        }
        let clinicId;
        let newClinic = null;
        // ✅ 2. Criar ou atualizar clínica
        if (clinic) {
            const { name, cnpj, description, address } = clinic;
            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Nome da clínica é obrigatório' });
            }
            // Se clinic_id já existe, usar ele
            if (clinicUser.clinic_id) {
                clinicId = clinicUser.clinic_id;
                // Atualizar clínica existente
                const { data: updatedClinic, error: updateError } = await supabase_1.supabase
                    .from('clinics')
                    .update({
                    name,
                    cnpj: cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(cnpj) : null,
                    description: description || null,
                    address: address || null,
                    status: clinicUser.clinic_id ? 'pending_unit' : 'pending_unit',
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', clinicId)
                    .select()
                    .single();
                if (updateError)
                    throw updateError;
                newClinic = updatedClinic;
            }
            else {
                // Buscar dados do Auth se não foram fornecidos
                let clinicName = name;
                let clinicCnpj = cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(cnpj) : null;
                let clinicAddress = address;
                if (!clinicAddress) {
                    const { data: authUser, error: authError } = await supabase_1.supabaseAdmin.auth.admin.getUserById(user_id);
                    if (!authError && authUser?.user) {
                        const metadata = authUser.user.user_metadata || {};
                        clinicName = clinicName || metadata.name || 'Clínica sem nome';
                        clinicCnpj = clinicCnpj || (metadata.cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(metadata.cnpj) : null);
                        clinicAddress = clinicAddress || metadata.address || '';
                    }
                }
                // Criar nova clínica
                const { data: createdClinic, error: createError } = await supabase_1.supabase
                    .from('clinics')
                    .insert({
                    id: user_id, // Clinic ID = User ID
                    name: clinicName,
                    cnpj: clinicCnpj,
                    description: description || null,
                    address: clinicAddress,
                    email: req.user?.email || null,
                    status: 'pending_unit'
                })
                    .select()
                    .single();
                if (createError)
                    throw createError;
                newClinic = createdClinic;
                clinicId = createdClinic.id;
                // Atualizar clinic_user com clinic_id
                await supabase_1.supabase
                    .from('clinic_users')
                    .update({
                    clinic_id: clinicId,
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', clinicUser.id);
            }
        }
        else {
            // Se não forneceu dados da clínica, verificar se já existe
            if (clinicUser.clinic_id) {
                clinicId = clinicUser.clinic_id;
            }
            else {
                // Buscar dados do Auth
                const { data: authUser, error: authError } = await supabase_1.supabaseAdmin.auth.admin.getUserById(user_id);
                if (authError || !authUser?.user) {
                    return res.status(400).json({ error: 'Dados da clínica são obrigatórios' });
                }
                const metadata = authUser.user.user_metadata || {};
                const clinicName = metadata.name || 'Clínica sem nome';
                const clinicCnpj = metadata.cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(metadata.cnpj) : null;
                const clinicAddress = metadata.address || '';
                // Criar nova clínica
                const { data: createdClinic, error: createError } = await supabase_1.supabase
                    .from('clinics')
                    .insert({
                    id: user_id,
                    name: clinicName,
                    cnpj: clinicCnpj,
                    address: clinicAddress,
                    email: authUser.user.email || null,
                    status: 'pending_unit'
                })
                    .select()
                    .single();
                if (createError)
                    throw createError;
                newClinic = createdClinic;
                clinicId = createdClinic.id;
                // Atualizar clinic_user com clinic_id
                await supabase_1.supabase
                    .from('clinic_users')
                    .update({
                    clinic_id: clinicId,
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', clinicUser.id);
            }
        }
        // ✅ 3. Se unit for null, apenas salvar clínica e retornar
        if (!unit) {
            res.status(201).json({
                clinic: newClinic,
                message: 'Dados da clínica salvos. Complete o cadastro da primeira unidade quando estiver pronto.'
            });
            return;
        }
        // ✅ 4. Criar primeira unidade
        if (!unit.name || !unit.nickname || !unit.address || !unit.city || !unit.state) {
            return res.status(400).json({
                error: 'Dados da unidade incompletos. Nome, apelido, endereço, cidade e estado são obrigatórios.'
            });
        }
        const { data: newUnit, error: unitError } = await supabase_1.supabase
            .from('units')
            .insert({
            clinic_id: clinicId,
            name: unit.name,
            nickname: unit.nickname.trim(),
            cnpj: unit.cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(unit.cnpj) : null,
            address: unit.address,
            city: unit.city,
            state: unit.state,
            phone: unit.phone || null,
            technical_manager: unit.technical_manager || null,
            is_main: true,
            status: 'pending_review'
        })
            .select()
            .single();
        if (unitError)
            throw unitError;
        // ✅ 5. Atualizar status da clínica para pending_approval
        await supabase_1.supabase
            .from('clinics')
            .update({ status: 'pending_approval' })
            .eq('id', clinicId);
        const nowIso = new Date().toISOString();
        // ✅ 6. Vincular CADMIN à unidade e marcar conclusão do onboarding
        await supabase_1.supabase
            .from('clinic_users')
            .update({
            clinic_id: clinicId, // ✅ Garantir que está vinculado
            unit_id: newUnit.id, // ✅ Vincular à primeira unidade
            status: 'active', // ✅ Ativar usuário
            first_login_completed_at: nowIso,
            onboarding_state: {
                last_step: 'unit',
                completed: true,
                completed_at: nowIso,
            },
            updated_at: nowIso,
        })
            .eq('id', clinicUser.id);
        res.status(201).json({
            clinic: newClinic,
            unit: newUnit,
            message: 'Clínica e unidade cadastradas! Aguarde aprovação do administrador.'
        });
    }
    catch (error) {
        console.error('Error in registerClinicWithUnit:', error);
        res.status(500).json({ error: error.message || 'Erro ao registrar clínica e unidade' });
    }
};
exports.registerClinicWithUnit = registerClinicWithUnit;
