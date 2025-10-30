"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingApplicationsCount = exports.getApplicationsByUnit = exports.getApplicationsByClinic = exports.getApplicationsByDemand = exports.applyToDemand = void 0;
const supabase_1 = require("../config/supabase");
const applyToDemand = async (req, res) => {
    const { demand_id, vet_id } = req.body;
    const { data, error } = await supabase_1.supabase
        .from('applications')
        .insert([{ demand_id, vet_id, status: 'applied' }])
        .select();
    if (error)
        return res.status(400).json({ error });
    res.status(201).json({ application: data[0] });
};
exports.applyToDemand = applyToDemand;
// Tipando o param da rota
const getApplicationsByDemand = async (req, res) => {
    const { demand_id } = req.params;
    const { data, error } = await supabase_1.supabase
        .from('applications')
        .select('*')
        .eq('demand_id', demand_id);
    if (error)
        return res.status(400).json({ error });
    res.json({ applications: data });
};
exports.getApplicationsByDemand = getApplicationsByDemand;
// Get applications by clinic (all applications for clinic's demands)
const getApplicationsByClinic = async (req, res) => {
    const { clinic_id } = req.query;
    if (!clinic_id) {
        return res.status(400).json({ error: 'clinic_id is required' });
    }
    try {
        // First get all demands for this clinic
        const { data: demands, error: demandsError } = await supabase_1.supabase
            .from('demands')
            .select('id')
            .eq('clinic_id', clinic_id);
        if (demandsError)
            throw demandsError;
        const demandIds = demands?.map(d => d.id) || [];
        if (demandIds.length === 0) {
            return res.json({ applications: [] });
        }
        // Then get all applications for those demands
        const { data, error } = await supabase_1.supabase
            .from('applications')
            .select('*')
            .in('demand_id', demandIds)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({ applications: data || [] });
    }
    catch (error) {
        console.error('Error getting applications by clinic:', error);
        res.status(500).json({ error: error.message || 'Failed to get applications' });
    }
};
exports.getApplicationsByClinic = getApplicationsByClinic;
// Get applications by unit
const getApplicationsByUnit = async (req, res) => {
    const { unitId } = req.params;
    try {
        // First get all demands for this unit
        const { data: demands, error: demandsError } = await supabase_1.supabase
            .from('demands')
            .select('id')
            .eq('unit_id', unitId);
        if (demandsError)
            throw demandsError;
        const demandIds = demands?.map(d => d.id) || [];
        if (demandIds.length === 0) {
            return res.json({ applications: [] });
        }
        // Then get all applications for those demands
        const { data, error } = await supabase_1.supabase
            .from('applications')
            .select('*')
            .in('demand_id', demandIds)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({ applications: data || [] });
    }
    catch (error) {
        console.error('Error getting applications by unit:', error);
        res.status(500).json({ error: error.message || 'Failed to get applications' });
    }
};
exports.getApplicationsByUnit = getApplicationsByUnit;
// Get pending applications count
const getPendingApplicationsCount = async (req, res) => {
    const { clinic_id, unit_id } = req.query;
    if (!clinic_id) {
        return res.status(400).json({ error: 'clinic_id is required' });
    }
    try {
        // Get demands for the clinic/unit
        let demandsQuery = supabase_1.supabase
            .from('demands')
            .select('id')
            .eq('clinic_id', clinic_id);
        if (unit_id) {
            demandsQuery = demandsQuery.eq('unit_id', unit_id);
        }
        const { data: demands, error: demandsError } = await demandsQuery;
        if (demandsError)
            throw demandsError;
        const demandIds = demands?.map(d => d.id) || [];
        if (demandIds.length === 0) {
            return res.json({ count: 0 });
        }
        // Count pending applications
        const { count, error } = await supabase_1.supabase
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .in('demand_id', demandIds)
            .eq('status', 'applied');
        if (error)
            throw error;
        res.json({ count: count || 0 });
    }
    catch (error) {
        console.error('Error getting pending applications count:', error);
        res.status(500).json({ error: error.message || 'Failed to get pending applications count' });
    }
};
exports.getPendingApplicationsCount = getPendingApplicationsCount;
