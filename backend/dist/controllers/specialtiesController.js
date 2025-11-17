"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSpecialty = exports.updateSpecialty = exports.createSpecialty = exports.getSpecialties = void 0;
const supabase_1 = require("../config/supabase");
const getSpecialties = async (req, res) => {
    const { category } = req.query;
    try {
        // Construir query base
        let query = supabase_1.supabaseAdmin.from('specialties').select('*');
        // Se uma categoria específica foi solicitada, filtrar por role
        if (category && typeof category === 'string') {
            const categoryLower = category.toLowerCase();
            // Filtrar por role (vet, freelancer, clinic, other)
            query = query.eq('role', categoryLower);
            console.log(`[getSpecialties] Buscando especialidades com role='${categoryLower}'`);
        }
        else {
            console.log(`[getSpecialties] Buscando todas as especialidades (sem filtro de categoria)`);
            // Se não há filtro de categoria, excluir freelancer por padrão (para não aparecer em outros lugares)
            query = query.neq('role', 'freelancer');
        }
        const { data, error } = await query.order('name');
        if (error) {
            console.error('[getSpecialties] Error fetching specialties:', error);
            return res.status(400).json({ error: error.message });
        }
        console.log(`[getSpecialties] Total de especialidades retornadas: ${data?.length || 0}`);
        // Filtro adicional no código para garantir que corresponde à categoria solicitada
        const filteredData = (data || []).filter((s) => {
            const specialtyRole = (s.role || '').toLowerCase();
            // Se uma categoria específica foi solicitada, garantir que corresponde
            if (category && typeof category === 'string') {
                const requestedCategory = category.toLowerCase();
                return specialtyRole === requestedCategory;
            }
            // Se não há filtro de categoria, retornar todas exceto freelancer (já filtrado na query)
            return true;
        });
        console.log(`[getSpecialties] Retornando ${filteredData.length} especialidades após filtro (categoria solicitada: ${category || 'todas'})`);
        if (filteredData.length > 0) {
            console.log(`[getSpecialties] Primeiras 3 especialidades:`, filteredData.slice(0, 3).map((s) => ({ name: s.name, role: s.role, category: s.category })));
        }
        res.json({ specialties: filteredData });
    }
    catch (error) {
        console.error('[getSpecialties] Erro inesperado:', error);
        return res.status(500).json({ error: error.message || 'Erro ao buscar especialidades' });
    }
};
exports.getSpecialties = getSpecialties;
/**
 * Criar nova especialidade (apenas admin)
 */
const createSpecialty = async (req, res) => {
    try {
        const user = req.user;
        const userRole = user?.user_metadata?.role || user?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem criar especialidades.' });
        }
        const { name, category, role, description } = req.body;
        // Validações
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Nome da especialidade é obrigatório' });
        }
        if (!category || typeof category !== 'string') {
            return res.status(400).json({ error: 'Categoria é obrigatória' });
        }
        // Validar role se fornecido
        if (role) {
            const validRoles = ['vet', 'freelancer', 'clinic', 'other'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    error: `Role inválido. Valores permitidos: ${validRoles.join(', ')}`
                });
            }
        }
        // Se role não foi fornecido, determinar baseado na category
        let finalRole = role;
        if (!finalRole) {
            const categoryLower = (category || '').toLowerCase();
            if (categoryLower === 'freelancer' || categoryLower === 'estética' || categoryLower === 'estetica') {
                finalRole = 'freelancer';
            }
            else {
                finalRole = 'vet'; // Default para vet
            }
        }
        // Verificar se já existe especialidade com o mesmo nome
        const { data: existing, error: checkError } = await supabase_1.supabaseAdmin
            .from('specialties')
            .select('id')
            .eq('name', name.trim())
            .maybeSingle();
        if (checkError) {
            console.error('Erro ao verificar especialidade existente:', checkError);
            return res.status(500).json({ error: 'Erro ao verificar especialidade existente' });
        }
        if (existing) {
            return res.status(400).json({ error: 'Já existe uma especialidade com este nome' });
        }
        // Criar especialidade
        const { data: specialty, error: createError } = await supabase_1.supabaseAdmin
            .from('specialties')
            .insert({
            name: name.trim(),
            category,
            role: finalRole,
            description: description?.trim() || null,
        })
            .select()
            .single();
        if (createError) {
            console.error('Erro ao criar especialidade:', createError);
            return res.status(500).json({ error: 'Erro ao criar especialidade: ' + createError.message });
        }
        return res.status(201).json({ specialty });
    }
    catch (error) {
        console.error('Erro ao criar especialidade:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao criar especialidade' });
    }
};
exports.createSpecialty = createSpecialty;
/**
 * Atualizar especialidade existente (apenas admin)
 */
const updateSpecialty = async (req, res) => {
    try {
        const user = req.user;
        const userRole = user?.user_metadata?.role || user?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem atualizar especialidades.' });
        }
        const { id } = req.params;
        const { name, category, role, description } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'ID da especialidade é obrigatório' });
        }
        // Validações
        if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
            return res.status(400).json({ error: 'Nome da especialidade não pode ser vazio' });
        }
        if (category !== undefined) {
            const validCategories = ['vet', 'freelancer', 'clinic', 'other'];
            if (!validCategories.includes(category)) {
                return res.status(400).json({
                    error: `Categoria inválida. Valores permitidos: ${validCategories.join(', ')}`
                });
            }
        }
        // Validar role se fornecido
        if (role !== undefined) {
            const validRoles = ['vet', 'freelancer', 'clinic', 'other'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    error: `Role inválido. Valores permitidos: ${validRoles.join(', ')}`
                });
            }
        }
        // Verificar se especialidade existe
        const { data: existing, error: fetchError } = await supabase_1.supabaseAdmin
            .from('specialties')
            .select('id, name')
            .eq('id', id)
            .maybeSingle();
        if (fetchError) {
            console.error('Erro ao buscar especialidade:', fetchError);
            return res.status(500).json({ error: 'Erro ao buscar especialidade' });
        }
        if (!existing) {
            return res.status(404).json({ error: 'Especialidade não encontrada' });
        }
        // Se o nome está sendo alterado, verificar se não existe outra com o mesmo nome
        if (name && name.trim() !== existing.name) {
            const { data: duplicate, error: duplicateError } = await supabase_1.supabaseAdmin
                .from('specialties')
                .select('id')
                .eq('name', name.trim())
                .neq('id', id)
                .maybeSingle();
            if (duplicateError) {
                console.error('Erro ao verificar duplicata:', duplicateError);
                return res.status(500).json({ error: 'Erro ao verificar nome duplicado' });
            }
            if (duplicate) {
                return res.status(400).json({ error: 'Já existe outra especialidade com este nome' });
            }
        }
        // Preparar dados para atualização
        const updateData = {};
        if (name !== undefined)
            updateData.name = name.trim();
        if (category !== undefined)
            updateData.category = category;
        if (role !== undefined) {
            updateData.role = role;
        }
        else if (category !== undefined) {
            // Se category foi atualizada mas role não, recalcular role baseado na category
            const categoryLower = (category || '').toLowerCase();
            if (categoryLower === 'freelancer' || categoryLower === 'estética' || categoryLower === 'estetica') {
                updateData.role = 'freelancer';
            }
            else {
                updateData.role = 'vet'; // Default para vet
            }
        }
        if (description !== undefined)
            updateData.description = description?.trim() || null;
        // Atualizar especialidade
        const { data: updated, error: updateError } = await supabase_1.supabaseAdmin
            .from('specialties')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        if (updateError) {
            console.error('Erro ao atualizar especialidade:', updateError);
            return res.status(500).json({ error: 'Erro ao atualizar especialidade: ' + updateError.message });
        }
        return res.json({ specialty: updated });
    }
    catch (error) {
        console.error('Erro ao atualizar especialidade:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao atualizar especialidade' });
    }
};
exports.updateSpecialty = updateSpecialty;
/**
 * Deletar especialidade (apenas admin)
 * Verifica se está em uso antes de deletar
 */
const deleteSpecialty = async (req, res) => {
    try {
        const user = req.user;
        const userRole = user?.user_metadata?.role || user?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem deletar especialidades.' });
        }
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'ID da especialidade é obrigatório' });
        }
        // Buscar especialidade para obter o nome
        const { data: specialty, error: fetchError } = await supabase_1.supabaseAdmin
            .from('specialties')
            .select('id, name')
            .eq('id', id)
            .maybeSingle();
        if (fetchError) {
            console.error('Erro ao buscar especialidade:', fetchError);
            return res.status(500).json({ error: 'Erro ao buscar especialidade' });
        }
        if (!specialty) {
            return res.status(404).json({ error: 'Especialidade não encontrada' });
        }
        // Verificar se está em uso em vets.specialties (array de strings)
        // Usar RPC ou query SQL direta para verificar se array contém o valor
        let vetsUsing = [];
        try {
            // Tentar buscar vets que têm esta especialidade no array
            // No PostgreSQL, podemos usar @> (contains) ou qualquer operador
            const { data, error: vetsError } = await supabase_1.supabaseAdmin
                .from('vets')
                .select('id, name, specialties')
                .limit(100); // Buscar um batch para verificar
            if (!vetsError && data) {
                // Filtrar no código os que têm a especialidade no array
                vetsUsing = data.filter((vet) => vet.specialties &&
                    Array.isArray(vet.specialties) &&
                    vet.specialties.includes(specialty.name));
            }
            else if (vetsError) {
                console.error('Erro ao verificar uso em vets:', vetsError);
                // Continuar mesmo com erro, pois pode ser que a coluna não exista ou seja diferente
            }
        }
        catch (err) {
            console.error('Erro ao verificar uso em vets:', err);
        }
        // Verificar se está em uso em position_specialties
        const { data: positionsUsing, error: positionsError } = await supabase_1.supabaseAdmin
            .from('position_specialties')
            .select('id')
            .eq('specialty_name', specialty.name)
            .limit(1);
        if (positionsError) {
            console.error('Erro ao verificar uso em position_specialties:', positionsError);
        }
        // Se está em uso, não permitir deletar
        if ((vetsUsing && vetsUsing.length > 0) || (positionsUsing && positionsUsing.length > 0)) {
            return res.status(400).json({
                error: 'Não é possível deletar esta especialidade pois ela está em uso por veterinários ou demandas.'
            });
        }
        // Deletar especialidade
        const { error: deleteError } = await supabase_1.supabaseAdmin
            .from('specialties')
            .delete()
            .eq('id', id);
        if (deleteError) {
            console.error('Erro ao deletar especialidade:', deleteError);
            return res.status(500).json({ error: 'Erro ao deletar especialidade: ' + deleteError.message });
        }
        return res.json({ success: true, message: 'Especialidade deletada com sucesso' });
    }
    catch (error) {
        console.error('Erro ao deletar especialidade:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao deletar especialidade' });
    }
};
exports.deleteSpecialty = deleteSpecialty;
