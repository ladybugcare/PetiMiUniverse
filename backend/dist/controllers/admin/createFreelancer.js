"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFreelancer = void 0;
const supabase_1 = require("../../config/supabase");
const createAuthUser_1 = require("../../utils/createAuthUser");
const auditLog_1 = require("../../utils/auditLog");
const emailService_1 = require("../../utils/emailService");
const crypto_1 = __importDefault(require("crypto"));
/**
 * Controller responsável por criar um novo freelancer pelo painel admin
 * Fluxo:
 * 1️⃣ Cria o usuário no Supabase Auth
 * 2️⃣ Cria o registro em `freelancers` (usando o mesmo ID do auth.user)
 * 3️⃣ Envia e-mail de boas-vindas
 * 4️⃣ Registra log de auditoria
 */
const createFreelancer = async (req, res) => {
    const adminId = req.user.id;
    const { name, email, password, generate_password, document_type, document_number, address, phone, city, state, status, } = req.body;
    try {
        // Validar campos obrigatórios
        if (!name || !email || !document_type || !document_number || !address) {
            return res.status(400).json({
                success: false,
                error: 'Nome, email, tipo de documento, número do documento e endereço são obrigatórios.',
            });
        }
        // Validar tipo de documento
        if (document_type !== 'CPF' && document_type !== 'CNPJ') {
            return res.status(400).json({
                success: false,
                error: 'Tipo de documento deve ser CPF ou CNPJ.',
            });
        }
        // Normalizar número do documento
        const normalizedDocument = document_number.replace(/[^\d]/g, '');
        // Verificar se já existe freelancer com o mesmo documento
        const { data: existingDocument } = await supabase_1.supabaseAdmin
            .from('freelancers')
            .select('id')
            .eq('document_number', normalizedDocument)
            .maybeSingle();
        if (existingDocument) {
            return res.status(400).json({
                success: false,
                error: 'Este documento já está cadastrado.',
            });
        }
        // Verificar se já existe freelancer com o mesmo email
        const { data: existingEmail } = await supabase_1.supabaseAdmin
            .from('freelancers')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                error: 'Este email já está cadastrado.',
            });
        }
        // 1️⃣ Gera senha se necessário
        const finalPassword = password ||
            crypto_1.default.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
        // 2️⃣ Cria usuário no Auth
        const authUser = await (0, createAuthUser_1.createAuthUser)(email, finalPassword, name, 'freelancer');
        const newUserId = authUser.id; // este ID será também o ID na tabela `freelancers`
        // 3️⃣ Cria registro na tabela `freelancers`
        const { data: freelancer, error: freelancerError } = await supabase_1.supabase
            .from('freelancers')
            .insert([
            {
                id: newUserId, // mesmo ID do Supabase Auth
                name,
                email,
                document_type,
                document_number: normalizedDocument,
                address,
                phone: phone || null,
                city: city || null,
                state: state || null,
                status: status || 'active',
                approval_status: 'approved', // Admin cria já aprovado
                approved_by: adminId,
                approved_at: new Date().toISOString(),
                onboarding_completed: true, // Admin cria já com onboarding completo
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        ])
            .select()
            .single();
        if (freelancerError || !freelancer) {
            console.error('Erro ao criar registro em freelancers:', freelancerError);
            await supabase_1.supabaseAdmin.auth.admin.deleteUser(newUserId);
            throw new Error(freelancerError?.message || 'Erro ao criar perfil de freelancer');
        }
        // 4️⃣ Envia e-mail de boas-vindas
        try {
            await (0, emailService_1.sendWelcomeEmail)(email, name, 'freelancer', finalPassword, !!generate_password);
        }
        catch (err) {
            console.warn('Erro ao enviar e-mail de boas-vindas:', err);
        }
        // 5️⃣ Log de auditoria
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id: adminId,
            action: 'CREATE_FREELANCER',
            entity_type: 'freelancer',
            entity_id: newUserId,
            new_values: { name, email, document_type, status },
            ...metadata,
        });
        // ✅ Retorno de sucesso
        return res.status(201).json({
            success: true,
            message: 'Freelancer criado com sucesso!',
            freelancer,
        });
    }
    catch (error) {
        console.error('Erro ao criar freelancer:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erro interno ao criar freelancer',
        });
    }
};
exports.createFreelancer = createFreelancer;
