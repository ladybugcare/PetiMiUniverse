import { getUserRole, Role } from './authHelpers';

/**
 * Obtém a URL da foto de perfil do usuário
 * Verifica user_metadata.photo_url e user_metadata.avatar_url
 */
export const getUserPhotoUrl = (user: any): string | null => {
  if (!user) return null;
  
  // Verificar photo_url primeiro (padrão mais comum)
  if (user.user_metadata?.photo_url) {
    return user.user_metadata.photo_url;
  }
  
  // Fallback para avatar_url (compatibilidade)
  if (user.user_metadata?.avatar_url) {
    return user.user_metadata.avatar_url;
  }
  
  return null;
};

/**
 * Obtém o nome do usuário para exibir no avatar
 */
export const getUserDisplayName = (user: any): string => {
  if (!user) return 'User';
  
  // Prioridade: user_metadata.name > email (sem @) > 'User'
  return user.user_metadata?.name || 
         user.email?.split('@')[0] || 
         'User';
};

/**
 * Obtém o tipo de usuário para determinar a cor do avatar
 */
export const getUserTypeForAvatar = (user: any): 'admin' | 'clinic' | 'vet' | 'freelancer' | undefined => {
  if (!user) return undefined;
  
  const role = getUserRole(user);
  
  switch (role) {
    case 'ADMIN':
      return 'admin';
    case 'CADMIN':
    case 'CMANAGER':
      return 'clinic';
    case 'VET':
      return 'vet';
    case 'FREELANCER':
      return 'freelancer';
    default:
      return undefined;
  }
};

