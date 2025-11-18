/**
 * Utilitários para sanitização de inputs do usuário
 * Proteção contra XSS e injeção de código
 */

/**
 * Sanitiza string removendo tags HTML e caracteres perigosos
 * @param input - String a ser sanitizada
 * @param allowBasicFormatting - Se true, permite tags básicas de formatação (b, i, em, strong)
 * @returns String sanitizada
 */
export function sanitizeString(input: string, allowBasicFormatting: boolean = false): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove ou escapa tags HTML
  let sanitized = input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // Se permitir formatação básica, restaurar tags seguras
  if (allowBasicFormatting) {
    const safeTags = ['b', 'i', 'em', 'strong', 'p', 'br'];
    safeTags.forEach((tag) => {
      const openTag = new RegExp(`&lt;${tag}&gt;`, 'gi');
      const closeTag = new RegExp(`&lt;\\/${tag}&gt;`, 'gi');
      sanitized = sanitized.replace(openTag, `<${tag}>`).replace(closeTag, `</${tag}>`);
    });
  }

  // Remove caracteres de controle e normaliza espaços
  sanitized = sanitized
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove caracteres de controle
    .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
    .trim();

  return sanitized;
}

/**
 * Sanitiza objeto recursivamente
 * @param obj - Objeto a ser sanitizado
 * @param allowBasicFormatting - Se true, permite tags básicas de formatação
 * @returns Objeto sanitizado
 */
export function sanitizeObject<T>(obj: T, allowBasicFormatting: boolean = false): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj, allowBasicFormatting) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, allowBasicFormatting)) as T;
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObject(obj[key], allowBasicFormatting);
      }
    }
    return sanitized as T;
  }

  return obj;
}

/**
 * Valida e sanitiza email
 * @param email - Email a ser validado e sanitizado
 * @returns Email sanitizado ou null se inválido
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  // Remove espaços e caracteres perigosos
  const sanitized = email.trim().toLowerCase().replace(/[<>"']/g, '');

  // Validação básica de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitiza URL removendo javascript: e data: schemes perigosos
 * @param url - URL a ser sanitizada
 * @returns URL sanitizada ou null se perigosa
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim().toLowerCase();

  // Bloquear schemes perigosos
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:'];
  for (const scheme of dangerousSchemes) {
    if (trimmed.startsWith(scheme)) {
      return null;
    }
  }

  // Permitir apenas http, https, mailto
  const allowedSchemes = ['http://', 'https://', 'mailto:'];
  const hasAllowedScheme = allowedSchemes.some((scheme) => trimmed.startsWith(scheme));

  if (!hasAllowedScheme && trimmed.includes('://')) {
    return null;
  }

  return url.trim();
}

/**
 * Remove caracteres SQL injection comuns
 * @param input - String a ser sanitizada
 * @returns String sanitizada
 */
export function sanitizeForSQL(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove caracteres perigosos para SQL
  return input
    .replace(/['";\\]/g, '') // Remove aspas e ponto e vírgula
    .replace(/--/g, '') // Remove comentários SQL
    .replace(/\/\*/g, '') // Remove comentários de bloco
    .replace(/\*\//g, '')
    .trim();
}

/**
 * Sanitiza número removendo caracteres não numéricos
 * @param input - String contendo número
 * @returns Número sanitizado ou null
 */
export function sanitizeNumber(input: string): number | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Remove tudo exceto dígitos, ponto e sinal de menos
  const cleaned = input.replace(/[^\d.-]/g, '');
  const number = parseFloat(cleaned);

  if (isNaN(number)) {
    return null;
  }

  return number;
}

