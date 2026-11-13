type AuthLikeError = {
  code?: string;
  message?: string;
};

/**
 * Traduz erros do Supabase Auth no fluxo de nova senha.
 * O Auth responde em inglês (ex.: code `same_password`).
 */
export function passwordUpdateErrorMessage(error: AuthLikeError | null | undefined): string {
  const code = (error?.code ?? '').toLowerCase();
  const message = error?.message ?? '';
  const normalized = message.toLowerCase();

  if (code === 'same_password' || normalized.includes('different from the old password')) {
    return 'A nova senha precisa ser diferente da senha atual.';
  }

  if (code === 'weak_password' || normalized.includes('weak and easy to guess')) {
    return 'Essa senha é fácil de adivinhar. Escolha outra mais forte.';
  }

  return message.trim() || 'Não foi possível salvar a nova senha. Tente novamente.';
}
