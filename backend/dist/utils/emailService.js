"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = exports.sendInvitationEmail = exports.generateInvitationToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
// ===========================================================
// 🔹 GERA TOKEN DE CONVITE
// ===========================================================
const generateInvitationToken = () => {
    return crypto_1.default.randomBytes(32).toString('hex');
};
exports.generateInvitationToken = generateInvitationToken;
// ===========================================================
// 🔹 ENVIA E-MAIL DE CONVITE (placeholder)
// ===========================================================
const sendInvitationEmail = async (email, token, clinicId, unitId, role) => {
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${token}`;
    console.log('========================================');
    console.log('📧 INVITATION EMAIL');
    console.log('========================================');
    console.log(`To: ${email}`);
    console.log(`Subject: Convite para se juntar à equipe PetiVet`);
    console.log(`\nVocê foi convidado para se juntar como ${role}`);
    console.log(`Link de convite: ${invitationLink}`);
    console.log(`Clinic ID: ${clinicId}`);
    console.log(`Unit ID: ${unitId}`);
    console.log(`Token: ${token}`);
    console.log('========================================\n');
    // TODO: substituir logs por integração real (SendGrid, SES, Resend, etc.)
};
exports.sendInvitationEmail = sendInvitationEmail;
// ===========================================================
// 🔹 ENVIA E-MAIL DE BOAS-VINDAS (placeholder)
// ===========================================================
const sendWelcomeEmail = async (email, name, userType, password, generated = false) => {
    const loginLink = `${process.env.FRONTEND_URL || 'http://localhost:3002'}/login`;
    const userTypeDisplayNames = {
        clinic: 'Clínica',
        vet: 'Veterinário',
        supplier: 'Fornecedor',
        tutor: 'Tutor',
        admin: 'Administrador',
    };
    const userTypeDisplay = userTypeDisplayNames[userType] || userType;
    console.log('========================================');
    console.log('📧 WELCOME EMAIL');
    console.log('========================================');
    console.log(`To: ${email}`);
    console.log(`Subject: Bem-vindo(a) à PetiVet!`);
    console.log(`\nOlá ${name},`);
    console.log(`\nSua conta de ${userTypeDisplay} foi criada com sucesso na plataforma PetiVet!`);
    console.log(`\nCredenciais de acesso:`);
    console.log(`E-mail: ${email}`);
    if (password) {
        console.log(`Senha: ${password}${generated
            ? ' (gerada automaticamente - recomendamos alterar após o primeiro acesso)'
            : ''}`);
    }
    console.log(`\nLink de acesso: ${loginLink}`);
    console.log(`\nPassos recomendados:`);
    console.log(`1. Acesse o link acima e faça login`);
    if (generated && password) {
        console.log(`2. Altere sua senha na primeira vez que acessar`);
    }
    console.log(`\nBem-vindo(a) à nossa comunidade PetiVet 💜`);
    console.log('========================================\n');
};
exports.sendWelcomeEmail = sendWelcomeEmail;
