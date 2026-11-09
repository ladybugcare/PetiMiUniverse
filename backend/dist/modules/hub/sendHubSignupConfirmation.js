"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendHubSignupConfirmationEmail = sendHubSignupConfirmationEmail;
const supabase_js_1 = require("../../config/supabase.js");
const errors_js_1 = require("../../utils/errors.js");
/** Dispara o template Confirm signup do Supabase (SMTP do projeto). */
async function sendHubSignupConfirmationEmail(email, emailRedirectTo) {
    const { error } = await supabase_js_1.supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo },
    });
    if (error) {
        throw new errors_js_1.AppError(`Não foi possível enviar o e-mail de confirmação: ${error.message}`, 502, true, 'EMAIL_SEND_FAILED');
    }
}
