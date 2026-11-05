import { supabase } from '../../config/supabase.js';
import { AppError } from '../../utils/errors.js';

/** Dispara o template Confirm signup do Supabase (SMTP do projeto). */
export async function sendHubSignupConfirmationEmail(
  email: string,
  emailRedirectTo: string,
): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo },
  });
  if (error) {
    throw new AppError(
      `Não foi possível enviar o e-mail de confirmação: ${error.message}`,
      502,
      true,
      'EMAIL_SEND_FAILED',
    );
  }
}
