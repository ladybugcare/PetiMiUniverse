import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase';
import { createAuthUser } from '../../utils/createAuthUser';

/**
 * ===========================================================
 * 💼 Controller: Cadastro público de freelancers
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

export const createFreelancerPublic = async (req: Request, res: Response) => {
  const { name, document_type, document_number, address, email, password } = req.body;

  try {
    // Validar campos obrigatórios
    if (!name || !document_type || !document_number || !address || !email || !password) {
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

    // Verificar se já existe freelancer com o mesmo documento
    const { data: existingDocument, error: existingDocError } = await supabaseAdmin
      .from('freelancers')
      .select('id')
      .eq('document_number', normalizedDocument)
      .maybeSingle();

    if (existingDocError) {
      // Se o erro for porque a coluna não existe, apenas logamos e continuamos
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

    // Verificar se já existe freelancer com o mesmo email
    const { data: existingEmail, error: emailError } = await supabaseAdmin
      .from('freelancers')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (emailError && !emailError.message?.includes('column') && !emailError.message?.includes('does not exist')) {
      console.error('Error checking existing email:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar email existente: ' + emailError.message,
      });
    }

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        error: 'Este email já está cadastrado.',
      });
    }

    // 1️⃣ Cria usuário no Auth
    const authUser = await createAuthUser(email, password, name, 'freelancer');
    const newUserId = authUser.id;

    // 2️⃣ Cria registro em "freelancers"
    const freelancerData: any = {
      id: newUserId,
      name,
      document_type,
      document_number: normalizedDocument,
      address,
      email,
      created_at: new Date().toISOString(),
    };

    const { data: freelancer, error: freelancerError } = await supabase
      .from('freelancers')
      .insert([freelancerData])
      .select()
      .single();

    if (freelancerError || !freelancer) {
      // Se der erro, deletar usuário criado no auth
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(freelancerError?.message || 'Erro ao criar freelancer');
    }

    return res.status(201).json({
      success: true,
      message: 'Freelancer cadastrado com sucesso!',
      freelancer,
    });
  } catch (error: any) {
    console.error('Erro ao cadastrar freelancer:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao cadastrar freelancer',
    });
  }
};

