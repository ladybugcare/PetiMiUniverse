/**
 * Templates de mensagem WhatsApp em pt-BR para o Hub.
 * São textos locais pré-preenchidos no link wa.me — NÃO são templates aprovados
 * pela WhatsApp Business API (que são pagos e exigem verificação Meta).
 *
 * Cada clínica pode customizar os textos via Configurações de Sistema →
 * Templates de Mensagem (persistidos em hub_clinic_settings.message_templates).
 */

export type MessageTemplateKey = 'pet_ready' | 'pet_on_the_way' | 'appointment_reminder';

type TemplateVars = Partial<{
  tutor: string | null;
  pet: string | null;
  clinica: string | null;
  data: string | null;
  hora: string | null;
}>;

export const DEFAULT_TEMPLATES: Record<MessageTemplateKey, string> = {
  pet_ready: 'Olá {tutor}! O {pet} já está pronto para retirada{clinicaFrag}.',
  pet_on_the_way: 'Olá {tutor}! Estamos a caminho para levar o {pet} até você.',
  appointment_reminder: 'Olá {tutor}! Lembrete do horário do {pet} em {data} às {hora}.',
};

export const TEMPLATE_LABELS: Record<MessageTemplateKey, string> = {
  pet_ready: 'Pet pronto para retirada',
  pet_on_the_way: 'A caminho do tutor',
  appointment_reminder: 'Lembrete de consulta',
};

export const TEMPLATE_PLACEHOLDER_HINTS: Record<MessageTemplateKey, string> = {
  pet_ready: 'Variáveis disponíveis: {tutor}, {pet}, {clinica}',
  pet_on_the_way: 'Variáveis disponíveis: {tutor}, {pet}',
  appointment_reminder: 'Variáveis disponíveis: {tutor}, {pet}, {data}, {hora}',
};

/**
 * Substitui variáveis no template e limpa fragmentos sem valor.
 * Variáveis ausentes/vazias são removidas junto com qualquer preposição associada.
 *
 * @param overrides - Textos customizados pela clínica (de hub_clinic_settings.message_templates).
 *                    Chave ausente → usa DEFAULT_TEMPLATES.
 */
export function renderTemplate(
  key: MessageTemplateKey,
  vars: TemplateVars,
  overrides?: Record<string, string>,
): string {
  const base = overrides?.[key]?.trim() || DEFAULT_TEMPLATES[key];
  let text = base;

  // {clinicaFrag} é um fragmento condicional: " na <clinica>" ou vazio
  const clinica = vars.clinica?.trim();
  text = text.replace('{clinicaFrag}', clinica ? ` na ${clinica}` : '');

  const plain: Omit<TemplateVars, 'clinica'> = {
    tutor: vars.tutor,
    pet: vars.pet,
    data: vars.data,
    hora: vars.hora,
  };
  for (const [k, v] of Object.entries(plain)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v?.trim() ?? '');
  }

  // Limpa espaços duplos e placeholders não resolvidos
  return text.replace(/\{[^}]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
}
