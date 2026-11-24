export const QA_CLINIC_ID = 'a1111111-1111-4111-8111-111111111111';
export const QA_UNIT_ID = 'ac9e17b6-d19c-4aad-a098-5fbd3e7fe4af';

export const QA_USERS = {
  CFINANCE: 'qa.staging.a.cfinance@petmi.test',
  CADMIN: 'qa.staging.a.cadmin@petmi.test',
  CASSISTANT: 'qa.staging.a.cassistant@petmi.test',
} as const;

export const PRODUCT_NAMES = {
  antipulgas: 'Antipulgas QA',
  shampoo: 'Shampoo QA',
} as const;

/** Linha A R$100 + linha B R$50 = venda matriz R$150. */
export const MATRIX_LINE_A_AMOUNT = 100;
export const MATRIX_LINE_B_AMOUNT = 50;
export const MATRIX_SALE_TOTAL = MATRIX_LINE_A_AMOUNT + MATRIX_LINE_B_AMOUNT;

export const MATRIX_FILE = '/tmp/etapa_a_homolog_matrix.json';