"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDemandApplications = exports.deleteDemand = exports.updateDemandStatus = exports.updateDemand = exports.getDemandById = exports.getAllDemands = exports.getDemandsByUnit = exports.getRecentActivity = exports.getDemands = exports.createDemandV2 = exports.createDemand = void 0;
const supabase_1 = require("../config/supabase");
const notificationsController_1 = require("./notificationsController");
const demandValidationService_js_1 = require("../services/demandValidationService.js");
const demandLifecycleService_js_1 = require("../services/demandLifecycleService.js");
const notificationsController_js_1 = require("./notificationsController.js");
/**
 * @deprecated Use createDemandV2 instead
 */
const createDemand = async (req, res) => {
    const { title, description, clinic_id, category, required_specialties, demand_date, start_time, duration_hours, status, payment } = req.body;
    const { data, error } = await supabase_1.supabase
        .from('demands')
        .insert([{
            title,
            description,
            clinic_id,
            category: category || 'vet',
            required_specialties: required_specialties || [],
            demand_date,
            start_time,
            duration_hours,
            status: status || 'open',
            payment,
            vacancies: 1, // Default: 1 vaga
            filled_positions: 0 // Inicialmente nenhuma vaga preenchida
        }])
        .select();
    if (error)
        return res.status(400).json({ error: error.message });
    const newDemand = data[0];
    // Get clinic info for notification
    const { data: clinic } = await supabase_1.supabase
        .from('clinics')
        .select('name')
        .eq('id', clinic_id)
        .single();
    // Notify all veterinarians about new demand (broadcast)
    // Get all active veterinarians
    const { data: allVets } = await supabase_1.supabase
        .from('vets')
        .select('id')
        .eq('status', 'active');
    if (allVets && clinic) {
        // Send notification to all vets
        const notificationPromises = allVets.map((vet) => (0, notificationsController_1.createNotification)({
            user_id: vet.id,
            type: 'new_demand_created',
            title: 'Nova Oportunidade de Trabalho',
            message: `Nova vaga disponível: "${newDemand.title}" na ${clinic.name}`,
            link: `/demands/${newDemand.id}`,
            entity_type: 'demand',
            entity_id: newDemand.id,
        }));
        // Execute all notifications in parallel (don't wait or fail the request)
        Promise.all(notificationPromises).catch((err) => {
            console.error('Error sending new demand notifications:', err);
        });
    }
    res.status(201).json({ demand: newDemand });
};
exports.createDemand = createDemand;
/**
 * Criar demanda V2 - versão completa com validações, permissões e lifecycle
 */
const createDemandV2 = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        const { clinic_id, unit_id, category, title, description, demand_date, start_time, end_time, is_overnight, payment, positions, } = req.body;
        // Validar clínica
        await demandValidationService_js_1.DemandValidationService.validateClinic(clinic_id, userId);
        // Validar unidade (obter unit_id validado)
        const validatedUnitId = await demandValidationService_js_1.DemandValidationService.validateUnit(unit_id, clinic_id);
        // Validar data
        demandValidationService_js_1.DemandValidationService.validateDate(demand_date);
        // Validar categoria
        demandValidationService_js_1.DemandValidationService.validateCategory(category);
        // Validar posições
        demandValidationService_js_1.DemandValidationService.validatePositions(positions);
        // Validar especialidades para cada posição
        for (const position of positions) {
            await demandValidationService_js_1.DemandValidationService.validateSpecialties(position.specialties, category);
        }
        // Validar payment
        demandValidationService_js_1.DemandValidationService.validatePayment(payment);
        // Validar horários
        demandValidationService_js_1.DemandValidationService.validateTimeRange(start_time, end_time, is_overnight);
        // Calcular vacancies
        const vacancies = demandValidationService_js_1.DemandValidationService.calculateVacancies(positions);
        // Criar demanda
        const { data: createdDemand, error: demandError } = await supabase_1.supabase
            .from('demands')
            .insert({
            clinic_id,
            unit_id: validatedUnitId,
            category,
            title,
            description,
            demand_date,
            start_time,
            end_time,
            is_overnight,
            payment,
            vacancies,
            filled_positions: 0,
            status: 'open',
            is_composite: positions.length > 1,
        })
            .select()
            .single();
        if (demandError) {
            throw demandError;
        }
        // Criar posições
        const positionsData = positions.map((pos) => ({
            master_demand_id: createdDemand.id,
            specialty: pos.specialties[0], // Primeira especialidade para backward compatibility
            total_slots: pos.slots,
            individual_payment: pos.payment !== undefined ? pos.payment : payment, // Usar payment da posição ou payment geral
            description: null,
        }));
        const { data: createdPositions, error: posError } = await supabase_1.supabase
            .from('demand_positions')
            .insert(positionsData)
            .select();
        if (posError) {
            throw posError;
        }
        // Criar especialidades em position_specialties
        const specialtiesData = [];
        createdPositions.forEach((position, index) => {
            const posSpecialties = positions[index].specialties;
            posSpecialties.forEach((specialty) => {
                specialtiesData.push({
                    position_id: position.id,
                    specialty_name: specialty,
                });
            });
        });
        if (specialtiesData.length > 0) {
            const { error: specialtiesError } = await supabase_1.supabase
                .from('position_specialties')
                .insert(specialtiesData);
            if (specialtiesError) {
                console.error('Error creating position specialties:', specialtiesError);
                // Não falha totalmente, pois a posição já foi criada
            }
        }
        // Popular required_specialties com todas as especialidades únicas das posições
        const allSpecialties = Array.from(new Set(positions.flatMap((pos) => pos.specialties)));
        if (allSpecialties.length > 0) {
            const { error: updateSpecialtiesError } = await supabase_1.supabase
                .from('demands')
                .update({ required_specialties: allSpecialties })
                .eq('id', createdDemand.id);
            if (updateSpecialtiesError) {
                console.error('Error updating required_specialties:', updateSpecialtiesError);
                // Não falha totalmente, pois a demanda já foi criada
            }
        }
        // Calcular e atualizar status via lifecycle
        const calculatedStatus = await demandLifecycleService_js_1.DemandLifecycleService.calculateDemandStatus(createdDemand.id);
        await demandLifecycleService_js_1.DemandLifecycleService.updateDemandStatus(createdDemand.id, calculatedStatus);
        // Buscar nome da clínica para notificação
        const { data: clinic } = await supabase_1.supabase
            .from('clinics')
            .select('name')
            .eq('id', clinic_id)
            .single();
        // Notificar profissionais por categoria
        if (clinic) {
            (0, notificationsController_js_1.notifyProfessionalsByCategory)(category, createdDemand.id, clinic.name, title).catch((err) => {
                console.error('Error sending notifications:', err);
                // Não falhar a criação da demanda
            });
        }
        // Adicionar array de specialties aos positions retornados
        const positionsWithSpecialties = createdPositions.map((pos, index) => ({
            ...pos,
            specialties: positions[index].specialties,
        }));
        // Buscar demanda atualizada com status calculado
        const { data: updatedDemand } = await supabase_1.supabase
            .from('demands')
            .select('*')
            .eq('id', createdDemand.id)
            .single();
        res.status(201).json({
            demand: updatedDemand || createdDemand,
            positions: positionsWithSpecialties,
        });
    }
    catch (error) {
        console.error('Error in createDemandV2:', error);
        res.status(400).json({
            error: error.message || 'Erro ao criar demanda',
        });
    }
};
exports.createDemandV2 = createDemandV2;
const getDemands = async (req, res) => {
    const { user_role, user_id } = req.query;
    let query = supabase_1.supabase
        .from('demands')
        .select('*')
        .eq('status', 'open');
    // Filter by category based on user role
    // Professionals see demands that match their category (job opportunities)
    if (user_role === 'vet') {
        query = query.eq('category', 'vet');
    }
    else if (user_role === 'freelancer') {
        query = query.eq('category', 'freelancer');
    }
    else if (user_role === 'clinic' && user_id) {
        // Clinics only see their own demands
        query = query.eq('clinic_id', user_id);
    }
    const { data, error } = await query.order('demand_date', { ascending: true });
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ demands: data });
};
exports.getDemands = getDemands;
// Get recent activity for a clinic
const getRecentActivity = async (req, res) => {
    const { clinic_id, unit_id, limit = '10' } = req.query;
    if (!clinic_id) {
        return res.status(400).json({ error: 'clinic_id is required' });
    }
    try {
        let query = supabase_1.supabase
            .from('demands')
            .select('*')
            .eq('clinic_id', clinic_id);
        if (unit_id) {
            query = query.eq('unit_id', unit_id);
        }
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));
        if (error)
            throw error;
        res.json({ demands: data || [] });
    }
    catch (error) {
        console.error('Error getting recent activity:', error);
        res.status(500).json({ error: error.message || 'Failed to get recent activity' });
    }
};
exports.getRecentActivity = getRecentActivity;
// Get demands by unit
const getDemandsByUnit = async (req, res) => {
    const { unitId } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('demands')
            .select('*')
            .eq('unit_id', unitId)
            .eq('status', 'open') // Apenas demandas ativas
            .is('deleted_at', null) // Excluir demandas deletadas
            .order('demand_date', { ascending: true });
        if (error)
            throw error;
        res.json({ demands: data || [] });
    }
    catch (error) {
        console.error('Error getting demands by unit:', error);
        res.status(500).json({ error: error.message || 'Failed to get demands by unit' });
    }
};
exports.getDemandsByUnit = getDemandsByUnit;
// Get all demands (admin only, with optional filters)
const getAllDemands = async (req, res) => {
    const { status, clinic_id } = req.query;
    try {
        let query = supabase_1.supabase
            .from('demands')
            .select('*');
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }
        if (clinic_id) {
            query = query.eq('clinic_id', clinic_id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({ demands: data || [] });
    }
    catch (error) {
        console.error('Error getting all demands:', error);
        res.status(500).json({ error: error.message || 'Failed to get demands' });
    }
};
exports.getAllDemands = getAllDemands;
// Get demand by ID
const getDemandById = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('demands')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw error;
        res.json({ demand: data });
    }
    catch (error) {
        console.error('Error getting demand by ID:', error);
        res.status(500).json({ error: error.message || 'Failed to get demand' });
    }
};
exports.getDemandById = getDemandById;
// Update demand
const updateDemand = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        // Get current demand to check if status changed
        const { data: currentDemand } = await supabase_1.supabase
            .from('demands')
            .select('status')
            .eq('id', id)
            .single();
        // Remove fields that shouldn't be updated
        delete updates.id;
        delete updates.created_at;
        delete updates.clinic_id; // Prevent changing ownership
        const { data, error } = await supabase_1.supabase
            .from('demands')
            .update(updates)
            .eq('id', id)
            .select();
        if (error)
            throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Demand not found' });
        }
        // If status changed, notify all applicants
        if (updates.status && currentDemand && currentDemand.status !== updates.status) {
            // Get all applications for this demand
            const { data: applications } = await supabase_1.supabase
                .from('demand_applications')
                .select('vet_id, freelancer_id')
                .eq('demand_id', id);
            // Get demand info
            const { data: demandInfo } = await supabase_1.supabase
                .from('demands')
                .select('title')
                .eq('id', id)
                .single();
            if (applications && demandInfo && applications.length > 0) {
                const statusMessages = {
                    'in_progress': 'A demanda foi iniciada',
                    'closed': 'A demanda foi encerrada',
                    'cancelled': 'A demanda foi cancelada',
                };
                const notificationPromises = applications
                    .filter((app) => app.vet_id || app.freelancer_id)
                    .map((app) => (0, notificationsController_1.createNotification)({
                    user_id: app.vet_id || app.freelancer_id,
                    type: 'demand_status_changed',
                    title: 'Status de Demanda Atualizado',
                    message: `${statusMessages[updates.status] || 'O status da demanda mudou'}: "${demandInfo.title}"`,
                    link: `/demands/${id}`,
                    entity_type: 'demand',
                    entity_id: id,
                }));
                Promise.all(notificationPromises).catch((err) => {
                    console.error('Error sending demand status change notifications:', err);
                });
            }
        }
        res.json({ demand: data[0] });
    }
    catch (error) {
        console.error('Error updating demand:', error);
        res.status(500).json({ error: error.message || 'Failed to update demand' });
    }
};
exports.updateDemand = updateDemand;
// Update demand status
const updateDemandStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        // Validar status permitidos (incluindo novos status do lifecycle)
        const validStatuses = [
            'open',
            'with_applicants',
            'partially_filled',
            'filled',
            'in_progress',
            'awaiting_report',
            'completed',
            'canceled_by_clinic',
            'canceled_by_system',
            'expired',
            'cancelled', // Mantido para compatibilidade
            'closed', // Mantido para compatibilidade
        ];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Invalid status value. Allowed values: ${validStatuses.join(', ')}`
            });
        }
        // Get current status
        const { data: currentDemand } = await supabase_1.supabase
            .from('demands')
            .select('status, title')
            .eq('id', id)
            .single();
        const { data, error } = await supabase_1.supabase
            .from('demands')
            .update({ status })
            .eq('id', id)
            .select();
        if (error)
            throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Demand not found' });
        }
        // Notify all applicants if status changed
        if (currentDemand && currentDemand.status !== status) {
            // Get all applications for this demand (from both tables)
            const [applicationsResult, positionApplicationsResult] = await Promise.all([
                supabase_1.supabase
                    .from('demand_applications')
                    .select('vet_id, freelancer_id')
                    .eq('demand_id', id),
                supabase_1.supabase
                    .from('position_applications')
                    .select('vet_id')
                    .eq('position_id', id), // This might need adjustment based on schema
            ]);
            // Combine all vet_ids and freelancer_ids
            const allUserIds = new Set();
            if (applicationsResult.data) {
                applicationsResult.data.forEach((app) => {
                    if (app.vet_id)
                        allUserIds.add(app.vet_id);
                    if (app.freelancer_id)
                        allUserIds.add(app.freelancer_id);
                });
            }
            // Get position applications through demand_positions
            if (positionApplicationsResult.data) {
                // Get positions for this demand
                const { data: positions } = await supabase_1.supabase
                    .from('demand_positions')
                    .select('id')
                    .eq('master_demand_id', id);
                if (positions) {
                    const positionIds = positions.map(p => p.id);
                    const { data: posApps } = await supabase_1.supabase
                        .from('position_applications')
                        .select('vet_id')
                        .in('position_id', positionIds);
                    if (posApps) {
                        posApps.forEach((app) => allUserIds.add(app.vet_id));
                    }
                }
            }
            const statusMessages = {
                'in_progress': 'A demanda foi iniciada',
                'closed': 'A demanda foi encerrada',
                'cancelled': 'A demanda foi cancelada',
            };
            if (allUserIds.size > 0 && currentDemand.title) {
                const notificationPromises = Array.from(allUserIds).map((userId) => (0, notificationsController_1.createNotification)({
                    user_id: userId,
                    type: 'demand_status_changed',
                    title: 'Status de Demanda Atualizado',
                    message: `${statusMessages[status] || 'O status da demanda mudou'}: "${currentDemand.title}"`,
                    link: `/demands/${id}`,
                    entity_type: 'demand',
                    entity_id: id,
                }));
                Promise.all(notificationPromises).catch((err) => {
                    console.error('Error sending demand status change notifications:', err);
                });
            }
        }
        res.json({ demand: data[0] });
    }
    catch (error) {
        console.error('Error updating demand status:', error);
        res.status(500).json({ error: error.message || 'Failed to update demand status' });
    }
};
exports.updateDemandStatus = updateDemandStatus;
// Delete demand (soft delete)
const deleteDemand = async (req, res) => {
    const { id } = req.params;
    try {
        // Soft delete by updating a deleted flag
        const { data, error } = await supabase_1.supabase
            .from('demands')
            .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
            .eq('id', id)
            .select();
        if (error)
            throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Demand not found' });
        }
        res.json({ message: 'Demand deleted successfully', demand: data[0] });
    }
    catch (error) {
        console.error('Error deleting demand:', error);
        res.status(500).json({ error: error.message || 'Failed to delete demand' });
    }
};
exports.deleteDemand = deleteDemand;
// Get applications for a demand
const getDemandApplications = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('demand_applications')
            .select(`
        *,
        vets (
          id,
          name,
          email,
          crmv,
          specialties
        ),
        freelancers (
          id,
          name,
          email,
          document_number
        )
      `)
            .eq('demand_id', id)
            .order('applied_at', { ascending: false });
        if (error)
            throw error;
        res.json({ applications: data || [] });
    }
    catch (error) {
        console.error('Error getting demand applications:', error);
        res.status(500).json({ error: error.message || 'Failed to get applications' });
    }
};
exports.getDemandApplications = getDemandApplications;
