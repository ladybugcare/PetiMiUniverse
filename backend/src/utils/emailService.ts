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
  role: string
): Promise<void> => {
  const invitationLink = `${
    process.env.FRONTEND_URL || 'http://localhost:3000'
  }/accept-invitation?token=${token}`;

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
  console.log(`Subject: Bem-vindo(a) à PetiVet!`);
  console.log(`\nOlá ${name},`);
  console.log(`\nSua conta de ${userTypeDisplay} foi criada com sucesso na plataforma PetiVet!`);
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
  console.log(`\nBem-vindo(a) à nossa comunidade PetiVet 💜`);
  console.log('========================================\n');
};
