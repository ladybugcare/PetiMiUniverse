import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase';
import { createAuthUser } from '../../utils/createAuthUser';
import crypto from 'crypto';

/**
 * ===========================================================
 * 🩺 Controller: Cadastro público de veterinários
 * ===========================================================
 */
// Helper function to normalize document number (remove formatting)
const normalizeDocument = (doc: string): string => {
  return doc.replace(/[^\d]/g, '');
};

// Helper function to validate document number
const validateDocumentNumber = (docType: string, docNumber: string): boolean => {
  const normalized = normalizeDocument(docNumber);
  if (docType === 'CPF') {
    return normalized.length === 11;
  } else if (docType === 'CNPJ') {
    return normalized.length === 14;
  }
  return false;
};

export const createVetPublic = async (req: Request, res: Response) => {
  const { name, crmv, document_type, document_number, address, specialties, experience, email, password } = req.body;

  try {
    // Validar campos obrigatórios
    if (!name || !crmv || !document_type || !document_number || !address || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Todos os campos obrigatórios devem ser preenchidos.',
      });
    }

    // Validar tipo de documento
    if (document_type !== 'CPF' && document_type !== 'CNPJ') {
      return res.status(400).json({
        success: false,
        error: 'Tipo de documento deve ser CPF ou CNPJ.',
      });
    }

    // Validar número do documento
    if (!validateDocumentNumber(document_type, document_number)) {
      return res.status(400).json({
        success: false,
        error: document_type === 'CPF' 
          ? 'CPF deve ter 11 dígitos.' 
          : 'CNPJ deve ter 14 dígitos.',
      });
    }

    // Normalizar número do documento
    const normalizedDocument = normalizeDocument(document_number);

    // Verificar se já existe veterinário com o mesmo documento
    // Nota: Se a coluna document_number não existir ainda, ignoramos o erro e continuamos
    const { data: existingDocument, error: existingDocError } = await supabaseAdmin
      .from('vets')
      .select('id')
      .eq('document_number', normalizedDocument)
      .maybeSingle();

    if (existingDocError) {
      // Se o erro for porque a coluna não existe, apenas logamos e continuamos
      // (isso permite que a migration seja executada depois sem quebrar o cadastro)
      if (existingDocError.message?.includes('column') || existingDocError.message?.includes('does not exist')) {
        console.warn('Column document_number may not exist yet. Continuing without duplicate check:', existingDocError.message);
      } else {
        console.error('Error checking existing document:', existingDocError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao verificar documento existente: ' + existingDocError.message,
        });
      }
    }

    if (existingDocument) {
      return res.status(400).json({
        success: false,
        error: 'Este documento já está cadastrado.',
      });
    }

    // 1️⃣ Cria usuário no Auth com metadata incluindo CRMV
    // Isso permite que o trigger crie o registro com o CRMV correto
    const authUser = await createAuthUser(email, password, name, 'vet', {
      crmv,
      document_type,
      document_number: normalizedDocument,
      address,
      ...(specialties && { specialties }),
      ...(experience && { experience }),
    });
    const newUserId = authUser.id;

    // 2️⃣ Verificar se o registro já foi criado pelo trigger
    // Aguardar um pouco para dar tempo do trigger executar
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const { data: existingVet } = await supabaseAdmin
      .from('vets')
      .select('id, crmv, name, email')
      .eq('id', newUserId)
      .maybeSingle();

    // Se o registro já existe (criado pelo trigger), apenas validar
    if (existingVet) {
      // Verificar se o CRMV foi salvo corretamente
      if (!existingVet.crmv || existingVet.crmv !== crmv) {
        // Atualizar o CRMV se não foi salvo corretamente pelo trigger
        const { error: updateError } = await supabaseAdmin
          .from('vets')
          .update({ crmv })
          .eq('id', newUserId);
        
        if (updateError) {
          console.error('Erro ao atualizar CRMV:', updateError);
        }
      }

      // Buscar o registro completo para retornar
      const { data: vet, error: fetchError } = await supabaseAdmin
        .from('vets')
        .select('*')
        .eq('id', newUserId)
        .single();

      if (fetchError || !vet) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        throw new Error('Erro ao buscar registro criado pelo trigger');
      }

      return res.status(201).json({
        success: true,
        message: 'Veterinário cadastrado com sucesso!',
        vet,
      });
    }

    // 3️⃣ Se o trigger não criou, criar manualmente
    // Prepara os dados para inserção, incluindo apenas campos que existem
    const vetData: any = {
      id: newUserId,
      name,
      crmv,
      email,
      created_at: new Date().toISOString(),
    };

    // Adiciona campos novos apenas se a migration já foi executada
    // (tentamos adicionar e se der erro de coluna não existir, continuamos sem eles)
    try {
      // Tenta adicionar os novos campos
      vetData.document_type = document_type;
      vetData.document_number = normalizedDocument;
      vetData.address = address;
    } catch (e) {
      console.warn('New fields may not exist in database yet:', e);
    }

    // Campos opcionais
    if (specialties) vetData.specialties = specialties;
    if (experience) vetData.experience = experience;

    const { data: vet, error: vetError } = await supabase
      .from('vets')
      .insert([vetData])
      .select()
      .single();

    if (vetError || !vet) {
      // Se o erro for porque as colunas não existem, tenta inserir sem elas
      if (vetError?.message?.includes('column') || vetError?.message?.includes('does not exist')) {
        console.warn('New columns may not exist. Trying insert without them:', vetError.message);
        
        const fallbackData: any = {
          id: newUserId,
          name,
          crmv,
          email,
          created_at: new Date().toISOString(),
        };
        if (specialties) fallbackData.specialties = specialties;
        if (experience) fallbackData.experience = experience;

        const { data: fallbackVet, error: fallbackError } = await supabase
          .from('vets')
          .insert([fallbackData])
          .select()
          .single();

        if (fallbackError || !fallbackVet) {
          await supabaseAdmin.auth.admin.deleteUser(newUserId);
          throw new Error(fallbackError?.message || 'Erro ao criar veterinário');
        }

        return res.status(201).json({
          success: true,
          message: 'Veterinário cadastrado com sucesso! (Nota: Execute a migration para adicionar campos de documento)',
          vet: fallbackVet,
        });
      } else {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        throw new Error(vetError?.message || 'Erro ao criar veterinário');
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Veterinário cadastrado com sucesso!',
      vet,
    });
  } catch (error: any) {
    console.error('Erro ao cadastrar veterinário:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao cadastrar veterinário',
    });
  }
};
