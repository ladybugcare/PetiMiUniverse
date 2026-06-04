"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVet = exports.updateVetStatus = exports.updateVetPhoto = exports.updateVet = exports.getVetById = exports.checkEmail = exports.getVets = exports.createVet = void 0;
const supabase_1 = require("../config/supabase");
// Helper function to normalize document number (remove formatting)
const normalizeDocument = (doc) => {
    return doc.replace(/[^\d]/g, '');
};
// Helper function to validate document number
const validateDocumentNumber = (docType, docNumber) => {
    const normalized = normalizeDocument(docNumber);
    if (docType === 'CPF') {
        return normalized.length === 11;
    }
    else if (docType === 'CNPJ') {
        return normalized.length === 14;
    }
    return false;
};
const createVet = async (req, res) => {
    const { name, crmv, document_type, document_number, address, specialties, certificates, experience, email, password } = req.body;
    let newUserId = null;
    try {
        console.log('Creating vet with email:', email);
        // Validar campos obrigatórios
        if (!name || !crmv || !document_type || !document_number || !address || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
        }
        // Validar tipo de documento
        if (document_type !== 'CPF' && document_type !== 'CNPJ') {
            return res.status(400).json({ error: 'Tipo de documento deve ser CPF ou CNPJ.' });
        }
        // Validar número do documento
        if (!validateDocumentNumber(document_type, document_number)) {
            return res.status(400).json({
                error: document_type === 'CPF'
                    ? 'CPF deve ter 11 dígitos.'
                    : 'CNPJ deve ter 14 dígitos.'
            });
        }
        // Normalizar número do documento
        const normalizedDocument = normalizeDocument(document_number);
        // Verificar se já existe veterinário com o mesmo documento
        // Nota: Se a coluna document_number não existir ainda, ignoramos o erro e continuamos
        const { data: existingDocument, error: existingDocError } = await supabase_1.supabaseAdmin
            .from('vets')
            .select('id')
            .eq('document_number', normalizedDocument)
            .maybeSingle();
        if (existingDocError) {
            // Se o erro for porque a coluna não existe, apenas logamos e continuamos
            // (isso permite que a migration seja executada depois sem quebrar o cadastro)
            if (existingDocError.message?.includes('column') || existingDocError.message?.includes('does not exist')) {
                console.warn('Column document_number may not exist yet. Continuing without duplicate check:', existingDocError.message);
            }
            else {
                console.error('Error checking existing document:', existingDocError);
                return res.status(500).json({ error: 'Erro ao verificar documento existente: ' + existingDocError.message });
            }
        }
        if (existingDocument) {
            return res.status(400).json({ error: 'Este documento já está cadastrado.' });
        }
        // 🔍 Verifica se já existe veterinário com o mesmo e-mail
        const { data: existingVet, error: existingVetError } = await supabase_1.supabaseAdmin
            .from('vets')
            .select('id, status')
            .eq('email', email)
            .maybeSingle();
        if (existingVetError) {
            console.error('Error checking existing vet email:', existingVetError);
            return res.status(500).json({ error: 'Erro ao verificar cadastro existente de veterinário.' });
        }
        if (existingVet) {
            return res.status(400).json({ error: 'Este e-mail já está cadastrado como veterinário.' });
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
        const { data: authData, error: authError } = await supabase_1.supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: isLocalEnv, // ✅ Confirmar automaticamente em local, ❌ não confirmar em staging/prod
            user_metadata: {
                name,
                role: 'vet'
            },
        });
        if (authError || !authData?.user) {
            console.error('Auth error:', authError);
            return res.status(400).json({ error: authError?.message || 'Falha ao criar usuário no Supabase Auth.' });
        }
        newUserId = authData.user.id;
        console.log('Auth user created:', newUserId);
        // 2️⃣ Envia email de confirmação (apenas em staging/production)
        // IMPORTANTE: admin.createUser() NÃO envia email automaticamente
        // Precisamos gerar o link e o Supabase enviará o email
        if (!isLocalEnv) {
            try {
                const { data: linkData, error: linkError } = await supabase_1.supabaseAdmin.auth.admin.generateLink({
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
                }
                else {
                    console.log('[SIGNUP] Link de confirmação gerado com sucesso');
                    // O Supabase envia o email automaticamente quando geramos o link de signup
                    // O link está em linkData.properties.action_link se precisarmos usar manualmente
                    if (linkData?.properties?.action_link) {
                        console.log('[SIGNUP] Link gerado (email deve ter sido enviado):', linkData.properties.action_link.substring(0, 50) + '...');
                    }
                }
            }
            catch (linkErr) {
                console.error('[SIGNUP] Erro ao gerar/enviar link de confirmação:', linkErr);
                console.error('[SIGNUP] Stack:', linkErr?.stack);
                // Não falha o cadastro, mas é crítico que o email seja enviado
            }
        }
        else {
            console.log('[SIGNUP] Ambiente local detectado - email confirmado automaticamente');
        }
        // 3️⃣ Verifica se o trigger do Supabase já criou o registro na tabela "vets"
        const { data: existingVetRecord } = await supabase_1.supabase
            .from('vets')
            .select('id')
            .eq('id', newUserId)
            .maybeSingle();
        // 4️⃣ Insere o perfil apenas se o trigger não tiver criado automaticamente
        if (!existingVetRecord) {
            // Prepara os dados para inserção
            const vetData = {
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
            }
            catch (e) {
                console.warn('New fields may not exist in database yet:', e);
            }
            const { data, error } = await supabase_1.supabase
                .from('vets')
                .insert(vetData)
                .select()
                .single();
            if (error) {
                // Se o erro for porque as colunas não existem, tenta inserir sem elas
                if (error.message?.includes('column') || error.message?.includes('does not exist')) {
                    console.warn('New columns may not exist. Trying insert without them:', error.message);
                    const fallbackData = {
                        id: newUserId,
                        name,
                        crmv,
                        specialties: specialties || [],
                        certificates: certificates || [],
                        experience: experience || null,
                        email,
                        status: 'pending_verification',
                    };
                    const { data: fallbackVet, error: fallbackError } = await supabase_1.supabase
                        .from('vets')
                        .insert(fallbackData)
                        .select()
                        .single();
                    if (fallbackError || !fallbackVet) {
                        console.error('Insert error (fallback):', fallbackError);
                        try {
                            await supabase_1.supabaseAdmin.auth.admin.deleteUser(newUserId);
                            console.log('Rolled back auth user after vet profile error:', newUserId);
                        }
                        catch (cleanupError) {
                            console.error('Failed to rollback auth user after vet profile error:', cleanupError);
                        }
                        return res.status(400).json({
                            error: 'Erro ao criar perfil. Execute a migration add_vet_document_and_address.sql primeiro.'
                        });
                    }
                    console.log('Vet profile inserted successfully (without new fields - migration needed)');
                }
                else {
                    console.error('Insert error:', error);
                    try {
                        await supabase_1.supabaseAdmin.auth.admin.deleteUser(newUserId);
                        console.log('Rolled back auth user after vet profile error:', newUserId);
                    }
                    catch (cleanupError) {
                        console.error('Failed to rollback auth user after vet profile error:', cleanupError);
                    }
                    return res.status(400).json({ error: error.message || JSON.stringify(error) });
                }
            }
            else {
                console.log('Vet profile inserted successfully');
            }
        }
        else {
            console.log('Vet record already exists after Auth signup — skipping insert.');
        }
        // 5️⃣ Retorna sucesso
        res.status(201).json({
            message: 'Cadastro criado com sucesso. Verifique seu e-mail.',
            user: authData.user,
        });
    }
    catch (error) {
        console.error('Unexpected error:', error);
        // Rollback de usuário se algo falhar após criação do Auth
        if (newUserId) {
            try {
                await supabase_1.supabaseAdmin.auth.admin.deleteUser(newUserId);
                console.log('Rolled back auth user after failure:', newUserId);
            }
            catch (cleanupError) {
                console.error('Failed to rollback auth user after unexpected error:', cleanupError);
            }
        }
        res.status(500).json({ error: error.message || 'Erro interno ao registrar veterinário.' });
    }
};
exports.createVet = createVet;
// 🧾 Listar todos os veterinários
const getVets = async (_req, res) => {
    const { data, error } = await supabase_1.supabase.from('vets').select('*');
    if (error)
        return res.status(400).json({ error });
    res.json({ vets: data });
};
exports.getVets = getVets;
// 📧 Verificar se e-mail já existe
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
// 🔍 Buscar veterinário por ID
const getVetById = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase.from('vets').select('*').eq('id', id).single();
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
const canVetUserMutateProfile = (req, vetId) => {
    const uid = req.user?.id;
    if (!uid)
        return false;
    if (uid === vetId)
        return true;
    const role = String(req.user?.role || '').toLowerCase();
    return role === 'admin';
};
// ✏️ Atualizar veterinário (perfil próprio ou admin)
const updateVet = async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    try {
        if (!canVetUserMutateProfile(req, id)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const allowedKeys = ['name', 'phone', 'address', 'bio', 'specialties', 'certificates', 'experience'];
        const updates = {};
        for (const key of allowedKeys) {
            if (key in body) {
                updates[key] = body[key];
            }
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo permitido para atualização foi enviado.' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
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
// 🖼️ Atualizar foto do veterinário (perfil próprio ou admin)
const updateVetPhoto = async (req, res) => {
    const { id } = req.params;
    const { photo_url } = req.body;
    try {
        if (!canVetUserMutateProfile(req, id)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        if (!photo_url)
            return res.status(400).json({ error: 'photo_url is required' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('vets')
            .update({ photo_url })
            .eq('id', id)
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        if (!data || data.length === 0)
            return res.status(404).json({ error: 'Vet not found' });
        res.json({ vet: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateVetPhoto = updateVetPhoto;
// ⚙️ Atualizar status
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
        if (error)
            return res.status(400).json({ error: error.message });
        if (!data || data.length === 0)
            return res.status(404).json({ error: 'Vet not found' });
        res.json({ vet: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateVetStatus = updateVetStatus;
// 🗑️ Exclusão lógica (soft delete)
const deleteVet = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .select();
        if (error)
            return res.status(400).json({ error: error.message });
        if (!data || data.length === 0)
            return res.status(404).json({ error: 'Vet not found' });
        res.json({ message: 'Vet deleted successfully', vet: data[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteVet = deleteVet;
