import crypto from 'crypto';

// ===========================================================
// 🔹 GERA TOKEN DE CONVITE
// ===========================================================
export const generateInvitationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// ===========================================================
// 🔹 ENVIA E-MAIL DE CONVITE (placeholder)
// ===========================================================
export const sendInvitationEmail = async (
  email: string,
  token: string,
  clinicId: string,
  unitId: string,
  role: string,
  invitationLink?: string,
): Promise<void> => {
  const hubWebUrl =
    process.env.HUB_WEB_URL?.trim() ||
    process.env.VITE_HUB_WEB_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:5173';
  const link =
    invitationLink ||
    `${hubWebUrl.replace(/\/$/, '')}/accept-invitation?token=${encodeURIComponent(token)}`;

  console.log('========================================');
  console.log('📧 INVITATION EMAIL (placeholder)');
  console.log('========================================');
  console.log(`To: ${email}`);
  console.log(`Subject: Convite para a equipe PetMi Hub`);
  console.log(`\nVocê foi convidado para se juntar como ${role}`);
  console.log(`Link de convite: ${link}`);
  console.log(`Clinic ID: ${clinicId}`);
  console.log(`Unit ID: ${unitId}`);
  console.log(`Token: ${token}`);
  console.log('========================================\n');

  // TODO: substituir logs por integração real (SendGrid, SES, Resend, etc.)
};

// ===========================================================
// 🔹 ENVIA E-MAIL DE BOAS-VINDAS (placeholder)
// ===========================================================
export const sendWelcomeEmail = async (
  email: string,
  name: string,
  userType: string,
  password?: string,
  generated: boolean = false
): Promise<void> => {
  const loginLink = `${
    process.env.FRONTEND_URL || 'http://localhost:3002'
  }/login`;

  const userTypeDisplayNames: Record<string, string> = {
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
  console.log(`Subject: Bem-vindo(a) à PetMi Vet!`);
  console.log(`\nOlá ${name},`);
  console.log(`\nSua conta de ${userTypeDisplay} foi criada com sucesso na plataforma PetMi Vet!`);
  console.log(`\nCredenciais de acesso:`);
  console.log(`E-mail: ${email}`);
  if (password) {
    console.log(
      `Senha: ${password}${
        generated
          ? ' (gerada automaticamente - recomendamos alterar após o primeiro acesso)'
          : ''
      }`
    );
  }
  console.log(`\nLink de acesso: ${loginLink}`);
  console.log(`\nPassos recomendados:`);
  console.log(`1. Acesse o link acima e faça login`);
  if (generated && password) {
    console.log(`2. Altere sua senha na primeira vez que acessar`);
  }
  console.log(`\nBem-vindo(a) à nossa comunidade PetMi Vet 💜`);
  console.log('========================================\n');
};
