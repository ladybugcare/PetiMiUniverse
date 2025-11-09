"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelApplication = exports.getVetApplications = exports.getDemandWithPositions = exports.getPositionApplications = exports.rejectApplication = exports.acceptApplication = exports.applyToPosition = exports.getAvailablePositions = exports.createCompositeDemand = void 0;
const supabase_1 = require("../config/supabase");
const notificationsController_1 = require("./notificationsController");
// Criar demanda composta com posições
const createCompositeDemand = async (req, res) => {
    const { title, description, clinic_id, unit_id, demand_date, start_time, end_time, category, is_overnight, positions, // [{specialties: ["Anestesista", "Cirurgião"], slots: 2, payment: 500, description: ""}, ...]
     } = req.body;
    try {
        // Validar horários
        if (!is_overnight) {
            // Se não for demanda noturna, validar que end_time > start_time
            if (end_time <= start_time) {
                return res.status(400).json({ error: 'Horário final deve ser após horário inicial' });
            }
        }
        // Se for demanda noturna, permite end_time < start_time (cruza meia-noite)
        // Validar que há pelo menos uma posição
        if (!positions || positions.length === 0) {
            return res.status(400).json({ error: 'É necessário especificar pelo menos uma posição' });
        }
        // Validar que cada posição tem pelo menos uma especialidade
        for (const pos of positions) {
            if (!pos.specialties || pos.specialties.length === 0) {
                return res.status(400).json({
                    error: 'Cada posição deve ter pelo menos uma especialidade'
                });
            }
        }
        // Criar demanda principal
        const { data: masterDemand, error: demandError } = await supabase_1.supabase
            .from('demands')
            .insert({
            title,
            description,
            clinic_id,
            unit_id,
            category: category || 'vet',
            demand_date,
            start_time,
            end_time,
            is_composite: positions.length > 1,
            status: 'open',
        })
            .select()
            .single();
        if (demandError) {
            console.error('Error creating master demand:', demandError);
            throw demandError;
        }
        // Criar posições (mantém specialty para backward compatibility)
        const positionsData = positions.map((pos) => ({
            master_demand_id: masterDemand.id,
            specialty: pos.specialties[0], // Primeira especialidade para backward compatibility
            total_slots: pos.slots || 1,
            individual_payment: pos.payment || 0,
            description: pos.description || null,
        }));
        const { data: createdPositions, error: posError } = await supabase_1.supabase
            .from('demand_positions')
            .insert(positionsData)
            .select();
        if (posError) {
            console.error('Error creating positions:', posError);
            throw posError;
        }
        // Criar registros na tabela position_specialties para cada especialidade
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
        const { error: specialtiesError } = await supabase_1.supabase
            .from('position_specialties')
            .insert(specialtiesData);
        if (specialtiesError) {
            console.error('Error creating position specialties:', specialtiesError);
            // Não falha totalmente, pois a posição já foi criada
        }
        // Adicionar array de specialties aos positions retornados
        const positionsWithSpecialties = createdPositions.map((pos, index) => ({
            ...pos,
            specialties: positions[index].specialties,
        }));
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
                message: `Nova vaga disponível: "${masterDemand.title}" na ${clinic.name}`,
                link: `/demands/${masterDemand.id}`,
                entity_type: 'demand',
                entity_id: masterDemand.id,
            }));
            // Execute all notifications in parallel (don't wait or fail the request)
            Promise.all(notificationPromises).catch((err) => {
                console.error('Error sending new demand notifications:', err);
            });
        }
        res.status(201).json({
            demand: masterDemand,
            positions: positionsWithSpecialties,
        });
    }
    catch (error) {
        console.error('Error in createCompositeDemand:', error);
        res.status(500).json({ error: error.message || 'Erro ao criar demanda' });
    }
};
exports.createCompositeDemand = createCompositeDemand;
// Listar posições disponíveis para veterinários
const getAvailablePositions = async (req, res) => {
    const { vet_id, specialty } = req.query;
    try {
        let query = supabase_1.supabase
            .from('positions_with_availability')
            .select('*')
            .gt('available_slots', 0);
        if (specialty) {
            query = query.eq('specialty', specialty);
        }
        const { data: positions, error } = await query.order('demand_date', { ascending: true });
        if (error)
            throw error;
        // Se vet_id fornecido, marcar quais já se candidatou
        if (vet_id && positions) {
            const { data: applications } = await supabase_1.supabase
                .from('position_applications')
                .select('position_id, status')
                .eq('vet_id', vet_id);
            const appliedMap = new Map(applications?.map((app) => [app.position_id, app.status]) || []);
            positions.forEach((pos) => {
                pos.application_status = appliedMap.get(pos.id) || null;
            });
        }
        res.json({ positions: positions || [] });
    }
    catch (error) {
        console.error('Error in getAvailablePositions:', error);
        res.status(500).json({ error: error.message || 'Erro ao buscar posições' });
    }
};
exports.getAvailablePositions = getAvailablePositions;
// Candidatar-se a uma posição
const applyToPosition = async (req, res) => {
    const { position_id, vet_id, message } = req.body;
    try {
        // Verificar se posição existe e está disponível
        const { data: position, error: posError } = await supabase_1.supabase
            .from('positions_with_availability')
            .select('*')
            .eq('id', position_id)
            .single();
        if (posError || !position) {
            return res.status(404).json({ error: 'Posição não encontrada ou não disponível' });
        }
        if (position.available_slots <= 0) {
            return res.status(400).json({ error: 'Posição já preenchida' });
        }
        // Verificar se já se candidatou
        const { data: existing } = await supabase_1.supabase
            .from('position_applications')
            .select('id, status')
            .eq('position_id', position_id)
            .eq('vet_id', vet_id)
            .maybeSingle();
        if (existing) {
            return res.status(400).json({
                error: 'Você já se candidatou a esta posição',
                existing_status: existing.status
            });
        }
        // Criar candidatura
        const { data: application, error: appError } = await supabase_1.supabase
            .from('position_applications')
            .insert({
            position_id,
            vet_id,
            message: message || null,
            status: 'pending',
        })
            .select()
            .single();
        if (appError)
            throw appError;
        res.status(201).json({ application });
    }
    catch (error) {
        console.error('Error in applyToPosition:', error);
        res.status(500).json({ error: error.message || 'Erro ao candidatar-se' });
    }
};
exports.applyToPosition = applyToPosition;
// Aceitar candidato (Admin/Clínica)
const acceptApplication = async (req, res) => {
    const { application_id } = req.params;
    try {
        // Verificar se candidatura existe
        const { data: existingApp } = await supabase_1.supabase
            .from('position_applications')
            .select('*, demand_positions!inner(total_slots, filled_slots, master_demand_id)')
            .eq('id', application_id)
            .single();
        if (!existingApp) {
            return res.status(404).json({ error: 'Candidatura não encontrada' });
        }
        // Verificar se ainda há vagas
        const position = existingApp.demand_positions;
        if (position.filled_slots >= position.total_slots) {
            return res.status(400).json({ error: 'Posição já está completa' });
        }
        // Atualizar candidatura (trigger automático fará o resto)
        const { data, error } = await supabase_1.supabase
            .from('position_applications')
            .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
            .eq('id', application_id)
            .select()
            .single();
        if (error)
            throw error;
        // Get demand info for notification
        const { data: demand } = await supabase_1.supabase
            .from('demands')
            .select('title')
            .eq('id', position.master_demand_id)
            .single();
        // Create notification for vet
        if (demand) {
            await (0, notificationsController_1.createNotification)({
                user_id: existingApp.vet_id,
                type: 'application_accepted',
                title: 'Candidatura Aceita! 🎉',
                message: `Sua candidatura para "${demand.title}" foi aceita`,
                link: `/demands/${position.master_demand_id}`,
                entity_type: 'application',
                entity_id: application_id
            });
        }
        res.json({
            application: data,
            message: 'Candidato aceito com sucesso'
        });
    }
    catch (error) {
        console.error('Error in acceptApplication:', error);
        res.status(500).json({ error: error.message || 'Erro ao aceitar candidato' });
    }
};
exports.acceptApplication = acceptApplication;
// Rejeitar candidato
const rejectApplication = async (req, res) => {
    const { application_id } = req.params;
    const { reason } = req.body;
    try {
        // Get application details before updating
        const { data: existingApp } = await supabase_1.supabase
            .from('position_applications')
            .select('vet_id, position_id, demand_positions!inner(master_demand_id)')
            .eq('id', application_id)
            .single();
        const { data, error } = await supabase_1.supabase
            .from('position_applications')
            .update({
            status: 'rejected',
            inactive_reason: reason || 'Candidatura rejeitada',
            updated_at: new Date().toISOString(),
        })
            .eq('id', application_id)
            .select()
            .single();
        if (error)
            throw error;
        // Get demand info for notification
        if (existingApp) {
            const position = existingApp.demand_positions;
            const { data: demand } = await supabase_1.supabase
                .from('demands')
                .select('title')
                .eq('id', position.master_demand_id)
                .single();
            // Create notification for vet
            if (demand) {
                await (0, notificationsController_1.createNotification)({
                    user_id: existingApp.vet_id,
                    type: 'application_rejected',
                    title: 'Candidatura Não Selecionada',
                    message: `Sua candidatura para "${demand.title}" não foi selecionada`,
                    link: `/vet-dashboard`,
                    entity_type: 'application',
                    entity_id: application_id
                });
            }
        }
        res.json({
            application: data,
            message: 'Candidatura rejeitada'
        });
    }
    catch (error) {
        console.error('Error in rejectApplication:', error);
        res.status(500).json({ error: error.message || 'Erro ao rejeitar candidato' });
    }
};
exports.rejectApplication = rejectApplication;
// Obter candidaturas de uma posição
const getPositionApplications = async (req, res) => {
    const { position_id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('position_applications')
            .select(`
        *,
        vets (
          id, name, email, crmv, specialties, experience
        )
      `)
            .eq('position_id', position_id)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({ applications: data || [] });
    }
    catch (error) {
        console.error('Error in getPositionApplications:', error);
        res.status(500).json({ error: error.message || 'Erro ao buscar candidaturas' });
    }
};
exports.getPositionApplications = getPositionApplications;
// Obter demanda com suas posições
const getDemandWithPositions = async (req, res) => {
    const { demand_id } = req.params;
    try {
        // Buscar demanda
        const { data: demand, error: demandError } = await supabase_1.supabase
            .from('demands')
            .select('*')
            .eq('id', demand_id)
            .single();
        if (demandError)
            throw demandError;
        // Buscar posições
        const { data: positions, error: posError } = await supabase_1.supabase
            .from('demand_positions')
            .select('*')
            .eq('master_demand_id', demand_id)
            .order('created_at', { ascending: true });
        if (posError)
            throw posError;
        // Buscar especialidades de cada posição
        if (positions && positions.length > 0) {
            for (const position of positions) {
                const { data: specialties } = await supabase_1.supabase
                    .from('position_specialties')
                    .select('specialty_name')
                    .eq('position_id', position.id);
                position.specialties = specialties?.map(s => s.specialty_name) || [];
            }
        }
        res.json({
            demand,
            positions: positions || [],
        });
    }
    catch (error) {
        console.error('Error in getDemandWithPositions:', error);
        res.status(500).json({ error: error.message || 'Erro ao buscar demanda' });
    }
};
exports.getDemandWithPositions = getDemandWithPositions;
// Obter candidaturas do veterinário
const getVetApplications = async (req, res) => {
    const { vet_id } = req.params;
    const { status } = req.query;
    try {
        let query = supabase_1.supabase
            .from('position_applications')
            .select(`
        *,
        demand_positions!inner(
          id, specialty, total_slots, filled_slots, individual_payment,
          demands!inner(
            id, title, description, demand_date, start_time, end_time, clinic_id
          )
        )
      `)
            .eq('vet_id', vet_id);
        if (status) {
            query = query.eq('status', status);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({ applications: data || [] });
    }
    catch (error) {
        console.error('Error in getVetApplications:', error);
        res.status(500).json({ error: error.message || 'Erro ao buscar candidaturas' });
    }
};
exports.getVetApplications = getVetApplications;
// Cancelar candidatura (pelo vet)
const cancelApplication = async (req, res) => {
    const { application_id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('position_applications')
            .update({
            status: 'cancelled_by_vet',
            updated_at: new Date().toISOString(),
        })
            .eq('id', application_id)
            .eq('status', 'pending') // Só pode cancelar se ainda estiver pendente
            .select()
            .single();
        if (error)
            throw error;
        if (!data) {
            return res.status(400).json({
                error: 'Não é possível cancelar esta candidatura'
            });
        }
        res.json({
            application: data,
            message: 'Candidatura cancelada'
        });
    }
    catch (error) {
        console.error('Error in cancelApplication:', error);
        res.status(500).json({ error: error.message || 'Erro ao cancelar candidatura' });
    }
};
exports.cancelApplication = cancelApplication;
