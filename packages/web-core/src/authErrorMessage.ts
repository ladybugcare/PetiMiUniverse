export type AuthErrorContext = 'login' | 'forgot' | 'reset' | 'confirm' | 'signup' | 'invite';

export type AuthLikeError = {
  code?: string;
  message?: string;
} | null | undefined;

const FALLBACK: Record<AuthErrorContext, string> = {
  login: 'Não foi possível entrar. Verifique o e-mail e a senha e tente novamente.',
  forgot: 'Não foi possível enviar o e-mail de recuperação. Tente novamente em alguns minutos.',
  reset: 'Não foi possível salvar a nova senha. Tente novamente.',
  confirm: 'Não foi possível confirmar o e-mail com este link.',
  signup: 'Não foi possível criar a conta. Tente novamente.',
  invite: 'Não foi possível concluir o convite. Tente novamente.',
};

function looksPortuguese(message: string): boolean {
  return /[áàâãéêíóôõúüç]/i.test(message);
}

function rateLimitMessage(message: string): string {
  const seconds = message.match(/(\d+)\s*seconds?/i);
  if (seconds) {
    return `Por segurança, aguarde ${seconds[1]} segundos antes de tentar de novo.`;
  }
  if (/email rate limit/i.test(message)) {
    return 'Enviamos muitos e-mails agora. Aguarde alguns minutos e tente de novo.';
  }
  return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
}

function linkExpiredMessage(context: AuthErrorContext): string {
  if (context === 'reset' || context === 'forgot') {
    return 'Este link expirou ou já foi usado. Solicite um novo e-mail em Esqueci minha senha.';
  }
  if (context === 'confirm') {
    return 'Este link de confirmação expirou ou já foi usado. Peça um novo e-mail de confirmação no login.';
  }
  return 'Este link expirou ou já foi usado. Peça um novo e tente novamente.';
}

function sessionMessage(context: AuthErrorContext): string {
  if (context === 'reset') {
    return 'Sua sessão de recuperação expirou. Solicite um novo link em Esqueci minha senha.';
  }
  return 'Sua sessão expirou. Entre novamente.';
}

function translateAuthError(
  code: string,
  normalized: string,
  message: string,
  context: AuthErrorContext,
): string | null {
  switch (code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed':
    case 'provider_email_needs_verification':
      return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada e o spam.';
    case 'user_banned':
      return 'Esta conta está bloqueada. Fale com o suporte.';
    case 'user_already_exists':
    case 'email_exists':
    case 'identity_already_exists':
      return 'Este e-mail já está cadastrado.';
    case 'same_password':
      return 'A nova senha precisa ser diferente da senha atual.';
    case 'weak_password':
      return 'Essa senha é fácil de adivinhar. Escolha outra mais forte.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return rateLimitMessage(message);
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return linkExpiredMessage(context);
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
      return sessionMessage(context);
    case 'email_address_invalid':
      return 'Informe um e-mail válido.';
    case 'signup_disabled':
      return 'O cadastro está indisponível no momento.';
    case 'captcha_failed':
      return 'Não foi possível validar a verificação de segurança. Tente novamente.';
    case 'email_address_not_authorized':
      return 'Este e-mail não pode receber mensagens agora. Tente de novo mais tarde.';
    case 'reauthentication_needed':
    case 'reauthentication_not_valid':
      return 'Confirme sua identidade e tente novamente.';
    case 'user_not_found':
      return context === 'forgot'
        ? FALLBACK.forgot
        : 'Não encontramos uma conta com esses dados.';
    default:
      break;
  }

  if (normalized.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (normalized.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada e o spam.';
  }
  if (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('user already exists') ||
    normalized.includes('email address has already')
  ) {
    return 'Este e-mail já está cadastrado.';
  }
  if (normalized.includes('different from the old password')) {
    return 'A nova senha precisa ser diferente da senha atual.';
  }
  if (normalized.includes('weak and easy to guess') || normalized.includes('password is known to be weak')) {
    return 'Essa senha é fácil de adivinhar. Escolha outra mais forte.';
  }
  if (
    normalized.includes('for security purposes') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return rateLimitMessage(message);
  }
  if (
    normalized.includes('invalid email') ||
    normalized.includes('invalid format') ||
    normalized.includes('unable to validate email')
  ) {
    return 'Informe um e-mail válido.';
  }
  if (
    normalized.includes('auth session missing') ||
    normalized.includes('session expired') ||
    normalized.includes('session not found') ||
    normalized.includes('invalid refresh token') ||
    normalized.includes('jwt expired')
  ) {
    return sessionMessage(context);
  }
  if (
    normalized.includes('email link is invalid') ||
    normalized.includes('token has expired') ||
    normalized.includes('otp_expired') ||
    normalized.includes('link is invalid or has expired') ||
    (normalized.includes('expired') && context !== 'login')
  ) {
    return linkExpiredMessage(context);
  }
  if (normalized.includes('user is banned') || normalized.includes('user banned')) {
    return 'Esta conta está bloqueada. Fale com o suporte.';
  }
  if (normalized.includes('signup is disabled') || normalized.includes('signups not allowed')) {
    return 'O cadastro está indisponível no momento.';
  }

  const minPassword = normalized.match(/at least (\d+) characters/);
  if (minPassword && normalized.includes('password')) {
    return `A senha precisa ter pelo menos ${minPassword[1]} caracteres.`;
  }

  const zodMin = message.match(/at least (\d+) character/i);
  if (zodMin && /string must contain|too small|expected string/i.test(message)) {
    return `Informe pelo menos ${zodMin[1]} caracteres.`;
  }

  if (normalized.includes('failed to fetch') || normalized.includes('networkerror') || normalized.includes('load failed')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }

  return null;
}

/** Traduz erros do Supabase Auth (e frases conhecidas em inglês) para pt-BR. */
export function authErrorMessage(
  error: AuthLikeError | string,
  context: AuthErrorContext = 'login',
): string {
  const fallback = FALLBACK[context];
  const code = (typeof error === 'string' ? '' : error?.code ?? '').toLowerCase();
  const message = (typeof error === 'string' ? error : error?.message ?? '').trim();
  const normalized = message.toLowerCase();

  const mapped = translateAuthError(code, normalized, message, context);
  if (mapped) return mapped;
  if (!message) return fallback;
  if (looksPortuguese(message)) return message;
  return fallback;
}
