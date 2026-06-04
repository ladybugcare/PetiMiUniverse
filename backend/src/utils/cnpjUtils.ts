/**
 * Utilitários para normalização e validação de CNPJ
 */

/**
 * Remove formatação do CNPJ (pontos, barras e traços)
 * @param cnpj CNPJ formatado ou não
 * @returns CNPJ apenas com números
 */
export const normalizeCNPJ = (cnpj: string | null | undefined): string => {
  if (!cnpj) return '';
  return cnpj.replace(/\D/g, '');
};

/**
 * Valida se o CNPJ tem o formato correto (14 dígitos)
 * @param cnpj CNPJ normalizado (apenas números)
 * @returns true se tiver 14 dígitos
 */
export const isValidCNPJFormat = (cnpj: string): boolean => {
  const normalized = normalizeCNPJ(cnpj);
  return normalized.length === 14;
};

