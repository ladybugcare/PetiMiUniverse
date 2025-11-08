import type { Request, Response } from 'express'
import { supabase, supabaseAdmin } from '../config/supabase'

interface VetBody {
  name: string
  crmv: string
  document_type: 'CPF' | 'CNPJ'
  document_number: string
  address: string
  specialties?: string[]
  certificates?: string[]
  experience?: string
  email: string
  password: string
}

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

export const createVet = async (req: Request<{}, {}, VetBody>, res: Response) => {
  const { name, crmv, document_type, document_number, address, specialties, certificates, experience, email, password } = req.body
  let newUserId: string | null = null

  try {
    console.log('Creating vet with email:', email)

    // Validar campos obrigatórios
    if (!name || !crmv || !document_type || !document_number || !address || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' })
    }

    // Validar tipo de documento
    if (document_type !== 'CPF' && document_type !== 'CNPJ') {
      return res.status(400).json({ error: 'Tipo de documento deve ser CPF ou CNPJ.' })
    }

    // Validar número do documento
    if (!validateDocumentNumber(document_type, document_number)) {
      return res.status(400).json({ 
        error: document_type === 'CPF' 
          ? 'CPF deve ter 11 dígitos.' 
          : 'CNPJ deve ter 14 dígitos.' 
      })
    }

    // Normalizar número do documento
    const normalizedDocument = normalizeDocument(document_number);

    // Verificar se já existe veterinário com o mesmo documento
    // Nota: Se a coluna document_number não existir ainda, ignoramos o erro e continuamos
    const { data: existingDocument, error: existingDocError } = await supabaseAdmin
      .from('vets')
      .select('id')
      .eq('document_number', normalizedDocument)
      .maybeSingle()

    if (existingDocError) {
      // Se o erro for porque a coluna não existe, apenas logamos e continuamos
      // (isso permite que a migration seja executada depois sem quebrar o cadastro)
      if (existingDocError.message?.includes('column') || existingDocError.message?.includes('does not exist')) {
        console.warn('Column document_number may not exist yet. Continuing without duplicate check:', existingDocError.message)
      } else {
        console.error('Error checking existing document:', existingDocError)
        return res.status(500).json({ error: 'Erro ao verificar documento existente: ' + existingDocError.message })
      }
    }

    if (existingDocument) {
      return res.status(400).json({ error: 'Este documento já está cadastrado.' })
    }

    // 🔍 Verifica se já existe veterinário com o mesmo e-mail
    const { data: existingVet, error: existingVetError } = await supabaseAdmin
      .from('vets')
      .select('id, status')
      .eq('email', email)
      .maybeSingle()

    if (existingVetError) {
      console.error('Error checking existing vet email:', existingVetError)
      return res.status(500).json({ error: 'Erro ao verificar cadastro existente de veterinário.' })
    }

    if (existingVet) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado como veterinário.' })
    }

    // Build redirect URL from environment
    const rawFrontendUrl = process.env.FRONTEND_URL?.trim();
    const FRONTEND_URL = rawFrontendUrl?.replace(/\/$/, '');
    if (!FRONTEND_URL) {
      console.error('[SIGNUP] FRONTEND_URL not set. Aborting to avoid wrong redirect.');
      return res.status(500).json({ error: 'FRONTEND_URL não configurada no servidor' });
    }
    const emailRedirectTo = `${FRONTEND_URL}/email-confirmed`;
    console.log('[SIGNUP] Using emailRedirectTo:', emailRedirectTo);

    // 🔍 Verifica se é ambiente local (não precisa confirmar email)
    // Local: URL contém localhost ou 127.0.0.1
    // Staging/Production: URL é https:// (não localhost)
    const isLocalEnv = FRONTEND_URL.includes('localhost') || 
                      FRONTEND_URL.includes('127.0.0.1');

    // 1️⃣ Cria o usuário no Supabase Auth
    // IMPORTANTE: Usa admin.createUser() com email_confirm baseado no ambiente
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: isLocalEnv, // ✅ Confirmar automaticamente em local, ❌ não confirmar em staging/prod
      user_metadata: { 
        name, 
        role: 'vet' 
      },
    })

    if (authError || !authData?.user) {
      console.error('Auth error:', authError)
      return res.status(400).json({ error: authError?.message || 'Falha ao criar usuário no Supabase Auth.' })
    }

    newUserId = authData.user.id
    console.log('Auth user created:', newUserId)

    // 2️⃣ Envia email de confirmação (apenas em staging/production)
    // IMPORTANTE: admin.createUser() NÃO envia email automaticamente
    // Precisamos gerar o link e o Supabase enviará o email
    if (!isLocalEnv) {
      try {
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'signup',
          email,
          password, // Necessário para generateLink type 'signup'
          options: {
            redirectTo: emailRedirectTo,
          },
        });

        if (linkError) {
          console.error('[SIGNUP] Erro ao gerar link de confirmação:', linkError);
          console.error('[SIGNUP] Detalhes do erro:', JSON.stringify(linkError, null, 2));
        } else {
          console.log('[SIGNUP] Link de confirmação gerado com sucesso');
          // O Supabase envia o email automaticamente quando geramos o link de signup
          // O link está em linkData.properties.action_link se precisarmos usar manualmente
          if (linkData?.properties?.action_link) {
            console.log('[SIGNUP] Link gerado (email deve ter sido enviado):', linkData.properties.action_link.substring(0, 50) + '...');
          }
        }
      } catch (linkErr: any) {
        console.error('[SIGNUP] Erro ao gerar/enviar link de confirmação:', linkErr);
        console.error('[SIGNUP] Stack:', linkErr?.stack);
        // Não falha o cadastro, mas é crítico que o email seja enviado
      }
    } else {
      console.log('[SIGNUP] Ambiente local detectado - email confirmado automaticamente');
    }

    // 3️⃣ Verifica se o trigger do Supabase já criou o registro na tabela "vets"
    const { data: existingVetRecord } = await supabase
      .from('vets')
      .select('id')
      .eq('id', newUserId)
      .maybeSingle()

    // 4️⃣ Insere o perfil apenas se o trigger não tiver criado automaticamente
    if (!existingVetRecord) {
      // Prepara os dados para inserção
      const vetData: any = {
        id: newUserId,
        name,
        crmv,
        specialties: specialties || [],
        certificates: certificates || [],
        experience: experience || null,
        email,
        status: 'pending_verification',
      };

      // Adiciona campos novos se a migration já foi executada
      try {
        vetData.document_type = document_type;
        vetData.document_number = normalizedDocument;
        vetData.address = address;
      } catch (e) {
        console.warn('New fields may not exist in database yet:', e);
      }

      const { data, error } = await supabase
        .from('vets')
        .insert(vetData)
        .select()
        .single()

      if (error) {
        // Se o erro for porque as colunas não existem, tenta inserir sem elas
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('New columns may not exist. Trying insert without them:', error.message);
          
          const fallbackData: any = {
            id: newUserId,
            name,
            crmv,
            specialties: specialties || [],
            certificates: certificates || [],
            experience: experience || null,
            email,
            status: 'pending_verification',
          };

          const { data: fallbackVet, error: fallbackError } = await supabase
            .from('vets')
            .insert(fallbackData)
            .select()
            .single();

          if (fallbackError || !fallbackVet) {
            console.error('Insert error (fallback):', fallbackError);
            try {
              await supabaseAdmin.auth.admin.deleteUser(newUserId);
              console.log('Rolled back auth user after vet profile error:', newUserId);
            } catch (cleanupError) {
              console.error('Failed to rollback auth user after vet profile error:', cleanupError);
            }
            return res.status(400).json({ 
              error: 'Erro ao criar perfil. Execute a migration add_vet_document_and_address.sql primeiro.' 
            });
          }

          console.log('Vet profile inserted successfully (without new fields - migration needed)');
        } else {
          console.error('Insert error:', error);
          try {
            await supabaseAdmin.auth.admin.deleteUser(newUserId);
            console.log('Rolled back auth user after vet profile error:', newUserId);
          } catch (cleanupError) {
            console.error('Failed to rollback auth user after vet profile error:', cleanupError);
          }
          return res.status(400).json({ error: error.message || JSON.stringify(error) });
        }
      } else {
        console.log('Vet profile inserted successfully');
      }
    } else {
      console.log('Vet record already exists after Auth signup — skipping insert.')
    }

    // 5️⃣ Retorna sucesso
    res.status(201).json({
      message: 'Cadastro criado com sucesso. Verifique seu e-mail.',
      user: authData.user,
    })
  } catch (error: any) {
    console.error('Unexpected error:', error)

    // Rollback de usuário se algo falhar após criação do Auth
    if (newUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        console.log('Rolled back auth user after failure:', newUserId)
      } catch (cleanupError) {
        console.error('Failed to rollback auth user after unexpected error:', cleanupError)
      }
    }

    res.status(500).json({ error: error.message || 'Erro interno ao registrar veterinário.' })
  }
}

// 🧾 Listar todos os veterinários
export const getVets = async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('vets').select('*')
  if (error) return res.status(400).json({ error })
  res.json({ vets: data })
}

// 📧 Verificar se e-mail já existe
export const checkEmail = async (req: Request, res: Response) => {
  const { email } = req.params
  try {
    const { data, error } = await supabase
      .from('vets')
      .select('email')
      .eq('email', email)
      .limit(1)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ exists: data && data.length > 0 })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// 🔍 Buscar veterinário por ID
export const getVetById = async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase.from('vets').select('*').eq('id', id).single()
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    res.json({ vet: data })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// ✏️ Atualizar veterinário
export const updateVet = async (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body

  try {
    delete updates.id
    delete updates.created_at

    const { data, error } = await supabase.from('vets').update(updates).eq('id', id).select()
    if (error) {
      return res.status(400).json({ error: error.message })
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Vet not found' })
    }

    res.json({ vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// 🖼️ Atualizar foto do veterinário
export const updateVetPhoto = async (req: Request, res: Response) => {
  const { id } = req.params
  const { photo_url } = req.body

  try {
    if (!photo_url) return res.status(400).json({ error: 'photo_url is required' })

    const { data, error } = await supabase
      .from('vets')
      .update({ photo_url })
      .eq('id', id)
      .select()

    if (error) return res.status(400).json({ error: error.message })
    if (!data || data.length === 0) return res.status(404).json({ error: 'Vet not found' })

    res.json({ vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// ⚙️ Atualizar status
export const updateVetStatus = async (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body

  try {
    if (!['active', 'pending', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' })
    }

    const { data, error } = await supabase
      .from('vets')
      .update({ status })
      .eq('id', id)
      .select()

    if (error) return res.status(400).json({ error: error.message })
    if (!data || data.length === 0) return res.status(404).json({ error: 'Vet not found' })

    res.json({ vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// 🗑️ Exclusão lógica (soft delete)
export const deleteVet = async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('vets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()

    if (error) return res.status(400).json({ error: error.message })
    if (!data || data.length === 0) return res.status(404).json({ error: 'Vet not found' })

    res.json({ message: 'Vet deleted successfully', vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
