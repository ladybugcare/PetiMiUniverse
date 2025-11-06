"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVet = void 0;
const supabase_1 = require("../../config/supabase");
const createAuthUser_1 = require("../../utils/createAuthUser");
const auditLog_1 = require("../../utils/auditLog");
const emailService_1 = require("../../utils/emailService");
const crypto_1 = __importDefault(require("crypto"));
/**
 * Controller responsável por criar um novo veterinário pelo painel admin
 * Fluxo:
 * 1️⃣ Cria o usuário no Supabase Auth
 * 2️⃣ Cria o registro em `vets` (usando o mesmo ID do auth.user)
 * 3️⃣ Envia e-mail de boas-vindas
 * 4️⃣ Registra log de auditoria
 */
const createVet = async (req, res) => {
    const adminId = req.user.id;
    const { name, email, password, generate_password, crmv, phone, city, state, status, } = req.body;
    try {
        // 1️⃣ Gera senha se necessário
        const finalPassword = password ||
            crypto_1.default.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
        // 2️⃣ Cria usuário no Auth
        const authUser = await (0, createAuthUser_1.createAuthUser)(email, finalPassword, name, 'vet');
        const newUserId = authUser.id; // este ID será também o ID na tabela `vets`
        // 3️⃣ Cria registro na tabela `vets`
        const { data: vet, error: vetError } = await supabase_1.supabase
            .from('vets')
            .insert([
            {
                id: newUserId, // mesmo ID do Supabase Auth
                name,
                email,
                crmv: crmv || null,
                phone: phone || null,
                city: city || null,
                state: state || null,
                specialties: [], // arrays vazios por padrão
                certificates: [],
                experience: null,
                bio: null,
                status: status || 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        ])
            .select()
            .single();
        if (vetError || !vet) {
            console.error('Erro ao criar registro em vets:', vetError);
            await supabase_1.supabaseAdmin.auth.admin.deleteUser(newUserId);
            throw new Error(vetError?.message || 'Erro ao criar perfil de veterinário');
        }
        // 4️⃣ Envia e-mail de boas-vindas
        try {
            await (0, emailService_1.sendWelcomeEmail)(email, name, 'vet', finalPassword, !!generate_password);
        }
        catch (err) {
            console.warn('Erro ao enviar e-mail de boas-vindas:', err);
        }
        // 5️⃣ Log de auditoria
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id: adminId,
            action: 'CREATE_VET',
            entity_type: 'vet',
            entity_id: newUserId,
            new_values: { name, email, crmv, status },
            ...metadata,
        });
        // ✅ Retorno de sucesso
        return res.status(201).json({
            success: true,
            message: 'Veterinário criado com sucesso!',
            vet,
        });
    }
    catch (error) {
        console.error('Erro ao criar veterinário:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erro interno ao criar veterinário',
        });
    }
};
exports.createVet = createVet;
