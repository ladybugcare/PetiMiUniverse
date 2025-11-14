"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFirstUnit = exports.getUnitStats = exports.deleteUnit = exports.updateUnit = exports.getUnitById = exports.getUnitsByClinic = exports.createUnit = void 0;
const supabase_1 = require("../config/supabase");
const authMiddleware_1 = require("../middleware/authMiddleware");
const auditLog_1 = require("../utils/auditLog");
const cnpjUtils_1 = require("../utils/cnpjUtils");
// Create unit (CADMIN only)
const createUnit = async (req, res) => {
    const { clinic_id, name, nickname, cnpj, address, city, state, phone, technical_manager, is_main, } = req.body;
    const user_id = req.user.id;
    try {
        // Validar nickname obrigatório
        if (!nickname || nickname.trim().length === 0) {
            return res.status(400).json({ error: 'O apelido da unidade é obrigatório' });
        }
        // Validar tamanho do nickname (máximo 100 caracteres)
        if (nickname.length > 100) {
            return res.status(400).json({ error: 'O apelido deve ter no máximo 100 caracteres' });
        }
        // Verify permission
        const hasPermission = await (0, authMiddleware_1.checkPermission)(user_id, clinic_id, 'unit.create');
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para criar unidades' });
        }
        // Verificar se nickname é único para esta clínica
        const { data: existingUnit, error: existingError } = await supabase_1.supabase
            .from('units')
            .select('id')
            .eq('clinic_id', clinic_id)
            .eq('nickname', nickname.trim())
            .maybeSingle();
        if (existingError) {
            console.error('Error checking nickname uniqueness:', existingError);
        }
        if (existingUnit) {
            return res.status(400).json({
                error: 'Já existe uma unidade com este apelido nesta clínica'
            });
        }
        // Create unit
        const { data, error } = await supabase_1.supabase
            .from('units')
            .insert([
            {
                clinic_id,
                name,
                nickname: nickname.trim(),
                cnpj,
                address,
                city,
                state,
                phone,
                technical_manager,
                is_main: is_main || false,
            },
        ])
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id,
            unit_id: data[0].id,
            action: 'CREATE_UNIT',
            entity_type: 'unit',
            entity_id: data[0].id,
            new_values: data[0],
            ...metadata,
        });
        res.status(201).json({ unit: data[0] });
    }
    catch (error) {
        console.error('Error creating unit:', error);
        res.status(500).json({ error: 'Erro ao criar unidade' });
    }
};
exports.createUnit = createUnit;
// Get units by clinic
const getUnitsByClinic = async (req, res) => {
    const { clinic_id } = req.params;
    const user_id = req.user.id;
    const includeAll = req.query.all === 'true'; // Query param to include all statuses
    try {
        // Verify clinic access
        const hasAccess = await (0, authMiddleware_1.checkClinicAccess)(user_id, clinic_id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        let query = supabase_1.supabase
            .from('units')
            .select('*')
            .eq('clinic_id', clinic_id);
        // If all=true, return all units regardless of status, otherwise only active/approved
        if (!includeAll) {
            query = query.in('status', ['active', 'approved']);
        }
        const { data, error } = await query
            .order('is_main', { ascending: false })
            .order('name');
        if (error)
            return res.status(400).json({ error: error.message });
        res.json({ units: data });
    }
    catch (error) {
        console.error('Error fetching units:', error);
        res.status(500).json({ error: 'Erro ao buscar unidades' });
    }
};
exports.getUnitsByClinic = getUnitsByClinic;
// Get unit by ID
const getUnitById = async (req, res) => {
    const { id } = req.params;
    const user_id = req.user.id;
    const userRole = req.user.role?.toLowerCase();
    try {
        const { data: unit, error } = await supabase_1.supabase
            .from('units')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            return res.status(404).json({ error: 'Unidade não encontrada' });
        // Permitir acesso público (read-only) para vets e admins
        // Clínicas precisam verificar acesso
        if (userRole === 'vet' || userRole === 'admin') {
            // Vets e admins podem ver o perfil da unidade (visualização pública)
            res.json({ unit });
            return;
        }
        // Se não tem role definido, verificar se é clínica
        // Se não for clínica, permitir acesso de leitura (pode ser vet sem role definido)
        const hasAccess = await (0, authMiddleware_1.checkClinicAccess)(user_id, unit.clinic_id);
        if (!hasAccess) {
            // Se não tem acesso à clínica e não é vet/admin, negar acesso
            // Mas se não tem role definido, pode ser um vet - permitir leitura
            if (!userRole) {
                // Sem role definido - assumir que pode ser acesso público de leitura
                res.json({ unit });
                return;
            }
            return res.status(403).json({ error: 'Acesso negado' });
        }
        res.json({ unit });
    }
    catch (error) {
        console.error('Error fetching unit:', error);
        res.status(500).json({ error: 'Erro ao buscar unidade' });
    }
};
exports.getUnitById = getUnitById;
// Update unit
const updateUnit = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const user_id = req.user.id;
    try {
        // Get current unit
        const { data: currentUnit, error: fetchError } = await supabase_1.supabase
            .from('units')
            .select('*')
            .eq('id', id)
            .single();
        if (fetchError)
            return res.status(404).json({ error: 'Unidade não encontrada' });
        // Verify permission
        const hasPermission = await (0, authMiddleware_1.checkPermission)(user_id, currentUnit.clinic_id, 'unit.edit');
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para editar unidades' });
        }
        // Update unit
        const { data, error } = await supabase_1.supabase
            .from('units')
            .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id: currentUnit.clinic_id,
            unit_id: id,
            action: 'UPDATE_UNIT',
            entity_type: 'unit',
            entity_id: id,
            old_values: currentUnit,
            new_values: data[0],
            ...metadata,
        });
        res.json({ unit: data[0] });
    }
    catch (error) {
        console.error('Error updating unit:', error);
        res.status(500).json({ error: 'Erro ao atualizar unidade' });
    }
};
exports.updateUnit = updateUnit;
// Delete unit (soft delete)
const deleteUnit = async (req, res) => {
    const { id } = req.params;
    const user_id = req.user.id;
    try {
        // Get current unit
        const { data: currentUnit, error: fetchError } = await supabase_1.supabase
            .from('units')
            .select('*')
            .eq('id', id)
            .single();
        if (fetchError)
            return res.status(404).json({ error: 'Unidade não encontrada' });
        // Verify permission
        const hasPermission = await (0, authMiddleware_1.checkPermission)(user_id, currentUnit.clinic_id, 'unit.delete');
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para deletar unidades' });
        }
        // Don't allow deletion of main unit
        if (currentUnit.is_main) {
            return res.status(400).json({ error: 'Não é possível deletar a unidade principal' });
        }
        // Soft delete
        const { data, error } = await supabase_1.supabase
            .from('units')
            .update({
            status: 'inactive',
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id: currentUnit.clinic_id,
            unit_id: id,
            action: 'DELETE_UNIT',
            entity_type: 'unit',
            entity_id: id,
            old_values: currentUnit,
            new_values: data[0],
            ...metadata,
        });
        res.json({ message: 'Unidade deletada com sucesso', unit: data[0] });
    }
    catch (error) {
        console.error('Error deleting unit:', error);
        res.status(500).json({ error: 'Erro ao deletar unidade' });
    }
};
exports.deleteUnit = deleteUnit;
// Get unit statistics
const getUnitStats = async (req, res) => {
    const { unitId } = req.params;
    const user_id = req.user.id;
    const userRole = req.user.role;
    try {
        // Get unit to verify access
        const { data: unit, error: unitError } = await supabase_1.supabase
            .from('units')
            .select('*')
            .eq('id', unitId)
            .single();
        if (unitError)
            return res.status(404).json({ error: 'Unidade não encontrada' });
        const normalizedRole = userRole?.toLowerCase();
        // Estatísticas são sensíveis - só permitir para própria clínica ou admin
        // Vets não devem ver estatísticas
        if (normalizedRole === 'vet') {
            return res.status(403).json({ error: 'Acesso negado a estatísticas' });
        }
        // Admins podem ver tudo
        if (normalizedRole === 'admin') {
            // Continuar para retornar estatísticas
        }
        else {
            // Para clínicas, verificar acesso
            const hasAccess = await (0, authMiddleware_1.checkClinicAccess)(user_id, unit.clinic_id);
            if (!hasAccess) {
                return res.status(403).json({ error: 'Acesso negado' });
            }
        }
        // Get demands count for this unit
        const { count: totalDemands, error: demandsError } = await supabase_1.supabase
            .from('demands')
            .select('*', { count: 'exact', head: true })
            .eq('unit_id', unitId)
            .is('deleted_at', null);
        if (demandsError) {
            console.error('Error getting total demands count:', demandsError);
            throw demandsError;
        }
        // Get open demands count
        const { count: openDemands, error: openError } = await supabase_1.supabase
            .from('demands')
            .select('*', { count: 'exact', head: true })
            .eq('unit_id', unitId)
            .eq('status', 'open')
            .is('deleted_at', null);
        if (openError) {
            console.error('Error getting open demands count:', openError);
            throw openError;
        }
        // Get demand IDs for this unit
        const { data: unitDemands, error: unitDemandsError } = await supabase_1.supabase
            .from('demands')
            .select('id')
            .eq('unit_id', unitId)
            .is('deleted_at', null);
        if (unitDemandsError) {
            console.error('Error getting unit demands:', unitDemandsError);
            throw unitDemandsError;
        }
        const demandIds = unitDemands?.map(d => d.id).filter((id) => !!id) || [];
        let applicationsCount = 0;
        let pendingApplicationsCount = 0;
        if (demandIds.length > 0) {
            try {
                // Separar demandas compostas e simples
                const { data: demandsData, error: demandsDataError } = await supabase_1.supabase
                    .from('demands')
                    .select('id, is_composite')
                    .in('id', demandIds);
                if (demandsDataError) {
                    console.error('Error getting demands data:', JSON.stringify(demandsDataError, null, 2));
                }
                else {
                    const compositeDemandIds = demandsData?.filter(d => d.is_composite).map(d => d.id) || [];
                    const simpleDemandIds = demandsData?.filter(d => !d.is_composite).map(d => d.id) || [];
                    // Para demandas simples: buscar em applications
                    if (simpleDemandIds.length > 0) {
                        const { count: simpleApps, error: simpleAppsError } = await supabase_1.supabase
                            .from('applications')
                            .select('*', { count: 'exact', head: true })
                            .in('demand_id', simpleDemandIds);
                        if (simpleAppsError) {
                            console.warn('Error getting simple applications (table may not exist):', JSON.stringify(simpleAppsError, null, 2));
                        }
                        else {
                            applicationsCount += simpleApps || 0;
                        }
                        const { count: simplePending, error: simplePendingError } = await supabase_1.supabase
                            .from('applications')
                            .select('*', { count: 'exact', head: true })
                            .in('demand_id', simpleDemandIds)
                            .eq('status', 'pending');
                        if (simplePendingError) {
                            console.warn('Error getting simple pending applications:', JSON.stringify(simplePendingError, null, 2));
                        }
                        else {
                            pendingApplicationsCount += simplePending || 0;
                        }
                    }
                    // Para demandas compostas: buscar em position_applications através de demand_positions
                    if (compositeDemandIds.length > 0) {
                        // Primeiro, buscar os position_ids das demandas compostas
                        const { data: positions, error: positionsError } = await supabase_1.supabase
                            .from('demand_positions')
                            .select('id')
                            .in('master_demand_id', compositeDemandIds);
                        if (positionsError) {
                            console.warn('Error getting positions for composite demands:', JSON.stringify(positionsError, null, 2));
                        }
                        else {
                            const positionIds = positions?.map(p => p.id) || [];
                            if (positionIds.length > 0) {
                                const { count: compositeApps, error: compositeAppsError } = await supabase_1.supabase
                                    .from('position_applications')
                                    .select('*', { count: 'exact', head: true })
                                    .in('position_id', positionIds);
                                if (compositeAppsError) {
                                    console.warn('Error getting composite applications:', JSON.stringify(compositeAppsError, null, 2));
                                }
                                else {
                                    applicationsCount += compositeApps || 0;
                                }
                                const { count: compositePending, error: compositePendingError } = await supabase_1.supabase
                                    .from('position_applications')
                                    .select('*', { count: 'exact', head: true })
                                    .in('position_id', positionIds)
                                    .eq('status', 'pending');
                                if (compositePendingError) {
                                    console.warn('Error getting composite pending applications:', JSON.stringify(compositePendingError, null, 2));
                                }
                                else {
                                    pendingApplicationsCount += compositePending || 0;
                                }
                            }
                        }
                    }
                }
            }
            catch (appsErr) {
                console.error('Exception while getting applications:', JSON.stringify(appsErr, null, 2));
                // Continuar com valores 0 se houver erro
                applicationsCount = 0;
                pendingApplicationsCount = 0;
            }
        }
        res.json({
            stats: {
                totalDemands: totalDemands || 0,
                openDemands: openDemands || 0,
                totalApplications: applicationsCount,
                pendingApplications: pendingApplicationsCount,
            },
        });
    }
    catch (error) {
        console.error('Error getting unit stats:', error);
        console.error('Error details:', {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
        });
        res.status(500).json({
            error: 'Erro ao buscar estatísticas da unidade',
            details: error?.message || 'Erro desconhecido'
        });
    }
};
exports.getUnitStats = getUnitStats;
// Create first unit (for new clinics waiting approval)
// ✅ NOVO FLUXO: Cria clinic primeiro (se não existir), depois cria unit e atualiza clinic_user
const createFirstUnit = async (req, res) => {
    const { clinic_id, name, nickname, address, city, state, phone, cnpj, technical_manager, clinic_name, clinic_cnpj, clinic_address } = req.body;
    const user_id = req.user.id;
    try {
        // Validar nickname obrigatório
        if (!nickname || nickname.trim().length === 0) {
            return res.status(400).json({ error: 'O apelido da unidade é obrigatório' });
        }
        // Validar tamanho do nickname (máximo 100 caracteres)
        if (nickname.length > 100) {
            return res.status(400).json({ error: 'O apelido deve ter no máximo 100 caracteres' });
        }
        // ✅ 1. Verificar clinic_user (deve existir com clinic_id = NULL e status = 'pending_clinic')
        const { data: clinicUser, error: clinicUserError } = await supabase_1.supabase
            .from('clinic_users')
            .select('id, role, clinic_id, status')
            .eq('user_id', user_id)
            .eq('role', 'CADMIN')
            .maybeSingle();
        if (clinicUserError || !clinicUser) {
            return res.status(403).json({ error: 'Usuário não encontrado ou sem permissão para criar primeira unidade' });
        }
        // Se clinic_id já existe, significa que já tem clínica (não deveria estar aqui)
        if (clinicUser.clinic_id) {
            return res.status(400).json({
                error: 'Usuário já possui clínica. Use o endpoint de criação de unidade normal.'
            });
        }
        // ✅ 2. Buscar dados do usuário do Auth (name, cnpj, address do signup)
        let clinicName = clinic_name;
        let clinicCnpj = clinic_cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(clinic_cnpj) : null;
        let clinicAddress = clinic_address;
        if (!clinicName || !clinicAddress) {
            // Buscar do user_metadata do Auth
            const { data: authUser, error: authError } = await supabase_1.supabaseAdmin.auth.admin.getUserById(user_id);
            if (!authError && authUser?.user) {
                const metadata = authUser.user.user_metadata || {};
                clinicName = clinicName || metadata.name || 'Clínica sem nome';
                clinicCnpj = clinicCnpj || (metadata.cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(metadata.cnpj) : null);
                clinicAddress = clinicAddress || metadata.address || '';
            }
        }
        if (!clinicName) {
            return res.status(400).json({ error: 'Nome da clínica é obrigatório' });
        }
        // ✅ 3. Criar clinic (se não existir)
        let finalClinicId;
        const { data: existingClinic } = await supabase_1.supabase
            .from('clinics')
            .select('id, status')
            .eq('id', user_id) // Clinic ID = User ID
            .maybeSingle();
        if (existingClinic) {
            // Clinic já existe, atualizar dados
            finalClinicId = existingClinic.id;
            await supabase_1.supabase
                .from('clinics')
                .update({
                name: clinicName,
                cnpj: clinicCnpj,
                address: clinicAddress,
                status: 'pending_unit', // Mudará para pending_approval após criar unit
                updated_at: new Date().toISOString(),
            })
                .eq('id', finalClinicId);
        }
        else {
            // Criar nova clinic
            const { data: newClinic, error: createClinicError } = await supabase_1.supabase
                .from('clinics')
                .insert({
                id: user_id, // Clinic ID = User ID
                name: clinicName,
                cnpj: clinicCnpj,
                address: clinicAddress,
                email: req.user.email || null,
                status: 'pending_unit', // Mudará para pending_approval após criar unit
                created_at: new Date().toISOString(),
            })
                .select()
                .single();
            if (createClinicError) {
                console.error('Error creating clinic:', createClinicError);
                return res.status(500).json({ error: 'Erro ao criar clínica' });
            }
            finalClinicId = newClinic.id;
        }
        // ✅ 4. Verificar se nickname é único para esta clínica
        const { data: existingUnit, error: existingError } = await supabase_1.supabase
            .from('units')
            .select('id')
            .eq('clinic_id', finalClinicId)
            .eq('nickname', nickname.trim())
            .maybeSingle();
        if (existingError) {
            console.error('Error checking nickname uniqueness:', existingError);
        }
        if (existingUnit) {
            return res.status(400).json({
                error: 'Já existe uma unidade com este apelido nesta clínica'
            });
        }
        // ✅ 5. Criar unidade com status pending_review
        const { data: unit, error: unitError } = await supabase_1.supabase
            .from('units')
            .insert({
            clinic_id: finalClinicId,
            name,
            nickname: nickname.trim(),
            address,
            city,
            state,
            phone,
            cnpj: cnpj ? (0, cnpjUtils_1.normalizeCNPJ)(cnpj) : null,
            technical_manager,
            is_main: true,
            status: 'pending_review'
        })
            .select()
            .single();
        if (unitError) {
            console.error('Error creating unit:', unitError);
            return res.status(500).json({ error: 'Erro ao criar unidade' });
        }
        // ✅ 6. Atualizar clinic para pending_approval
        await supabase_1.supabase
            .from('clinics')
            .update({ status: 'pending_approval' })
            .eq('id', finalClinicId);
        // ✅ 7. Atualizar clinic_user com clinic_id e unit_id
        const nowIso = new Date().toISOString();
        const { error: updateClinicUserError } = await supabase_1.supabase
            .from('clinic_users')
            .update({
            clinic_id: finalClinicId, // ✅ Agora vincula à clinic criada
            unit_id: unit.id, // ✅ Vincula à primeira unidade
            status: 'active', // ✅ Ativa o usuário
            first_login_completed_at: nowIso,
            onboarding_state: {
                last_step: 'unit',
                completed: true,
                completed_at: nowIso,
            },
            updated_at: nowIso,
        })
            .eq('id', clinicUser.id);
        if (updateClinicUserError) {
            console.error('Error updating clinic_user:', updateClinicUserError);
            // Rollback: deletar unit e clinic criados
            await supabase_1.supabase.from('units').delete().eq('id', unit.id);
            if (!existingClinic) {
                await supabase_1.supabase.from('clinics').delete().eq('id', finalClinicId);
            }
            return res.status(500).json({ error: 'Erro ao vincular usuário à clínica' });
        }
        // ✅ 8. Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id,
            clinic_id: finalClinicId,
            unit_id: unit.id,
            action: 'CREATE_FIRST_UNIT',
            entity_type: 'unit',
            entity_id: unit.id,
            new_values: unit,
            ...metadata,
        });
        res.status(201).json({
            clinic_id: finalClinicId,
            unit,
            message: 'Clínica e unidade criadas! Aguarde aprovação do ADMIN para ativar sua conta.'
        });
    }
    catch (error) {
        console.error('Error creating first unit:', error);
        res.status(500).json({ error: 'Erro ao criar unidade' });
    }
};
exports.createFirstUnit = createFirstUnit;
