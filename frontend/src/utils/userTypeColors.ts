// Cores padronizadas para tipos de usuário em toda a plataforma
// Cores pastéis e suaves para melhor visualização

export const userTypeColors = {
  vet: '#a78bfa',        // Roxo pastel para Veterinário
  clinic: '#86efac',      // Verde pastel para Clínica
  freelancer: '#93c5fd',  // Azul pastel para Freelancer
  admin: '#f59e0b',       // Laranja para Administrador (mantido)
} as const;

export type UserType = 'vet' | 'clinic' | 'freelancer' | 'admin';

export const getUserTypeColor = (type: UserType): string => {
  return userTypeColors[type] || userTypeColors.vet;
};

