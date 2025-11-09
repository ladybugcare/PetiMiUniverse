import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';

export const getSpecialties = async (req: Request, res: Response) => {
  const { category } = req.query;

  let query = supabase.from('specialties').select('*');

  if (category && typeof category === 'string') {
    query = query.eq('category', category);
  }

  const { data, error } = await query.order('name');

  if (error) return res.status(400).json({ error: error.message });
  res.json({ specialties: data });
};

/**
 * Criar nova especialidade (apenas admin)
 */
export const createSpecialty = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem criar especialidades.' });
    }

    const { name, category, description } = req.body;

    // Validações
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nome da especialidade é obrigatório' });
    }

    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'Categoria é obrigatória' });
    }

    const validCategories = ['vet', 'freelancer', 'clinic', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        error: `Categoria inválida. Valores permitidos: ${validCategories.join(', ')}` 
      });
    }

    // Verificar se já existe especialidade com o mesmo nome
    const { data: existing, error: checkError } = await supabaseAdmin
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
    const { data: specialty, error: createError } = await supabaseAdmin
      .from('specialties')
      .insert({
        name: name.trim(),
        category,
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (createError) {
      console.error('Erro ao criar especialidade:', createError);
      return res.status(500).json({ error: 'Erro ao criar especialidade: ' + createError.message });
    }

    return res.status(201).json({ specialty });
  } catch (error: any) {
    console.error('Erro ao criar especialidade:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao criar especialidade' });
  }
};

/**
 * Atualizar especialidade existente (apenas admin)
 */
export const updateSpecialty = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem atualizar especialidades.' });
    }

    const { id } = req.params;
    const { name, category, description } = req.body;

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

    // Verificar se especialidade existe
    const { data: existing, error: fetchError } = await supabaseAdmin
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
      const { data: duplicate, error: duplicateError } = await supabaseAdmin
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
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description?.trim() || null;

    // Atualizar especialidade
    const { data: updated, error: updateError } = await supabaseAdmin
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
  } catch (error: any) {
    console.error('Erro ao atualizar especialidade:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao atualizar especialidade' });
  }
};

/**
 * Deletar especialidade (apenas admin)
 * Verifica se está em uso antes de deletar
 */
export const deleteSpecialty = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem deletar especialidades.' });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'ID da especialidade é obrigatório' });
    }

    // Buscar especialidade para obter o nome
    const { data: specialty, error: fetchError } = await supabaseAdmin
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
    let vetsUsing: any[] = [];
    try {
      // Tentar buscar vets que têm esta especialidade no array
      // No PostgreSQL, podemos usar @> (contains) ou qualquer operador
      const { data, error: vetsError } = await supabaseAdmin
        .from('vets')
        .select('id, name, specialties')
        .limit(100); // Buscar um batch para verificar

      if (!vetsError && data) {
        // Filtrar no código os que têm a especialidade no array
        vetsUsing = data.filter((vet: any) => 
          vet.specialties && 
          Array.isArray(vet.specialties) && 
          vet.specialties.includes(specialty.name)
        );
      } else if (vetsError) {
        console.error('Erro ao verificar uso em vets:', vetsError);
        // Continuar mesmo com erro, pois pode ser que a coluna não exista ou seja diferente
      }
    } catch (err) {
      console.error('Erro ao verificar uso em vets:', err);
    }

    // Verificar se está em uso em position_specialties
    const { data: positionsUsing, error: positionsError } = await supabaseAdmin
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
    const { error: deleteError } = await supabaseAdmin
      .from('specialties')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Erro ao deletar especialidade:', deleteError);
      return res.status(500).json({ error: 'Erro ao deletar especialidade: ' + deleteError.message });
    }

    return res.json({ success: true, message: 'Especialidade deletada com sucesso' });
  } catch (error: any) {
    console.error('Erro ao deletar especialidade:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao deletar especialidade' });
  }
};

