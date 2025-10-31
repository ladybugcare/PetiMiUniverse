"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = exports.sendInvitationEmail = exports.generateInvitationToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
// Generate a unique invitation token
const generateInvitationToken = () => {
    return crypto_1.default.randomBytes(32).toString('hex');
};
exports.generateInvitationToken = generateInvitationToken;
// Send invitation email (placeholder - integrate with actual email service)
const sendInvitationEmail = async (email, token, clinicId, unitId, role) => {
    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${token}`;
    console.log('========================================');
    console.log('📧 INVITATION EMAIL');
    console.log('========================================');
    console.log(`To: ${email}`);
    console.log(`Subject: Convite para se juntar à equipe PetiVet`);
    console.log(`\nVocê foi convidado para se juntar como ${role}`);
    console.log(`Link de convite: ${invitationLink}`);
    console.log(`\nClinic ID: ${clinicId}`);
    console.log(`Unit ID: ${unitId}`);
    console.log(`Token: ${token}`);
    console.log('========================================\n');
    // Example integration with a real email service:
    /*
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Convite para se juntar à equipe PetiVet',
      html: `
        <h2>Você foi convidado!</h2>
        <p>Você recebeu um convite para se juntar à equipe como <strong>${role}</strong>.</p>
        <p>Clique no link abaixo para aceitar o convite:</p>
        <a href="${invitationLink}">Aceitar Convite</a>
        <p>Este link expira em 7 dias.</p>
      `,
    };
  
    await transporter.sendMail(mailOptions);
    */
};
exports.sendInvitationEmail = sendInvitationEmail;
// Send welcome email to newly created user (placeholder - integrate with actual email service)
const sendWelcomeEmail = async (email, name, userType, password, isPasswordGenerated = false) => {
    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
    const loginLink = `${process.env.FRONTEND_URL || 'http://localhost:3002'}/login`;
    const userTypeDisplayNames = {
        clinic: 'Clínica',
        vet: 'Veterinário',
        supplier: 'Fornecedor',
        tutor: 'Tutor',
    };
    const userTypeDisplay = userTypeDisplayNames[userType] || userType;
    console.log('========================================');
    console.log('📧 WELCOME EMAIL');
    console.log('========================================');
    console.log(`To: ${email}`);
    console.log(`Subject: Bem-vindo(a) à PetiVet!`);
    console.log(`\nOlá ${name},`);
    console.log(`\nSua conta ${userTypeDisplay} foi criada na plataforma PetiVet!`);
    console.log(`\nCredenciais de acesso:`);
    console.log(`E-mail: ${email}`);
    if (password) {
        console.log(`Senha: ${password}${isPasswordGenerated ? ' (gerada automaticamente - recomendamos alterar após o primeiro acesso)' : ''}`);
    }
    console.log(`\nLink de acesso: ${loginLink}`);
    console.log(`\nInstruções:`);
    console.log(`1. Acesse o link acima ou vá até a página de login`);
    console.log(`2. Faça login com suas credenciais`);
    if (isPasswordGenerated && password) {
        console.log(`3. Altere sua senha na primeira vez que acessar`);
    }
    console.log(`\nBem-vindo(a) à nossa plataforma!`);
    console.log('========================================\n');
    // Example integration with a real email service:
    /*
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Bem-vindo(a) à PetiVet!',
      html: `
        <h2>Olá ${name}!</h2>
        <p>Sua conta ${userTypeDisplay} foi criada na plataforma PetiVet!</p>
        <h3>Credenciais de acesso:</h3>
        <p><strong>E-mail:</strong> ${email}</p>
        ${password ? `<p><strong>Senha:</strong> ${password}${isPasswordGenerated ? ' (gerada automaticamente - recomendamos alterar após o primeiro acesso)' : ''}</p>` : ''}
        <p><a href="${loginLink}">Clique aqui para fazer login</a></p>
        ${isPasswordGenerated && password ? '<p><strong>Importante:</strong> Altere sua senha na primeira vez que acessar.</p>' : ''}
        <p>Bem-vindo(a) à nossa plataforma!</p>
      `,
    };
  
    await transporter.sendMail(mailOptions);
    */
};
exports.sendWelcomeEmail = sendWelcomeEmail;
