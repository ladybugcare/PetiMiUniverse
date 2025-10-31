"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDemandApplications = exports.deleteDemand = exports.updateDemandStatus = exports.updateDemand = exports.getDemandById = exports.getAllDemands = exports.getDemandsByUnit = exports.getRecentActivity = exports.getDemands = exports.createDemand = void 0;
const supabase_1 = require("../config/supabase");
const notificationsController_1 = require("./notificationsController");
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
            payment
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
                .from('applications')
                .select('vet_id')
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
                const notificationPromises = applications.map((app) => (0, notificationsController_1.createNotification)({
                    user_id: app.vet_id,
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
        if (!['open', 'in_progress', 'closed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
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
                    .from('applications')
                    .select('vet_id')
                    .eq('demand_id', id),
                supabase_1.supabase
                    .from('position_applications')
                    .select('vet_id')
                    .eq('position_id', id), // This might need adjustment based on schema
            ]);
            // Combine all vet_ids
            const allVetIds = new Set();
            if (applicationsResult.data) {
                applicationsResult.data.forEach((app) => allVetIds.add(app.vet_id));
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
                        posApps.forEach((app) => allVetIds.add(app.vet_id));
                    }
                }
            }
            const statusMessages = {
                'in_progress': 'A demanda foi iniciada',
                'closed': 'A demanda foi encerrada',
                'cancelled': 'A demanda foi cancelada',
            };
            if (allVetIds.size > 0 && currentDemand.title) {
                const notificationPromises = Array.from(allVetIds).map((vetId) => (0, notificationsController_1.createNotification)({
                    user_id: vetId,
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
            .from('applications')
            .select(`
        *,
        vets (
          id,
          name,
          email,
          crmv,
          specialties,
          experience
        )
      `)
            .eq('demand_id', id)
            .order('created_at', { ascending: false });
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
