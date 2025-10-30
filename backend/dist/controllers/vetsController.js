"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVet = exports.updateVetStatus = exports.updateVetPhoto = exports.updateVet = exports.getVetById = exports.checkEmail = exports.getVets = exports.createVet = void 0;
const supabase_1 = require("../config/supabase");
const createVet = async (req, res) => {
    const { name, crmv, specialties, certificates, experience, email, password } = req.body;
    try {
        console.log('Creating vet with email:', email);
        // 1. Create user in Supabase Auth first
        const { data: authData, error: authError } = await supabase_1.supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    role: 'vet'
                }
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
        // 2. Then create the vet profile (linked to auth user, without password)
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .insert([{
                id: authData.user.id, // Link to auth user
                name,
                crmv,
                specialties,
                certificates: certificates || [],
                experience,
                email
                // NO PASSWORD HERE - it's stored securely in auth.users
            }])
            .select();
        if (error) {
            console.error('Profile creation error:', error);
            // If profile creation fails, ideally we'd delete the auth user
            // but for now, just return the error
            return res.status(400).json({ error: error.message || JSON.stringify(error) });
        }
        console.log('Vet profile created successfully');
        res.status(201).json({
            vet: data[0],
            user: authData.user,
            session: authData.session
        });
    }
    catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
exports.createVet = createVet;
const getVets = async (_req, res) => {
    const { data, error } = await supabase_1.supabase.from('vets').select('*');
    if (error)
        return res.status(400).json({ error });
    res.json({ vets: data });
};
exports.getVets = getVets;
// Check if email already exists
const checkEmail = async (req, res) => {
    const { email } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('vets')
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
// Get vet by ID
const getVetById = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .select('*')
            .eq('id', id)
            .single();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        res.json({ vet: data });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getVetById = getVetById;
// Update vet
const updateVet = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        // Remove fields that shouldn't be updated
        delete updates.id;
        delete updates.created_at;
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .update(updates)
            .eq('id', id)
            .select();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Vet not found' });
        }
        res.json({ vet: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateVet = updateVet;
// Update vet photo
const updateVetPhoto = async (req, res) => {
    const { id } = req.params;
    const { photo_url } = req.body;
    try {
        if (!photo_url) {
            return res.status(400).json({ error: 'photo_url is required' });
        }
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .update({ photo_url })
            .eq('id', id)
            .select();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Vet not found' });
        }
        res.json({ vet: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateVetPhoto = updateVetPhoto;
// Update vet status
const updateVetStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        if (!['active', 'pending', 'inactive'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .update({ status })
            .eq('id', id)
            .select();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Vet not found' });
        }
        res.json({ vet: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateVetStatus = updateVetStatus;
// Delete vet (soft delete)
const deleteVet = async (req, res) => {
    const { id } = req.params;
    try {
        // Soft delete by updating a deleted flag
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .select();
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Vet not found' });
        }
        res.json({ message: 'Vet deleted successfully', vet: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteVet = deleteVet;
