export type SignUpErrorType = 
  | 'email_exists' 
  | 'cnpj_exists' 
  | 'cpf_exists' 
  | 'network_error' 
  | 'unexpected_error';

export interface ClassifiedError {
  type: SignUpErrorType;
  message?: string;
  originalError: any;
}

/**
 * Classifica erros de cadastro em tipos específicos para exibição de modais apropriados
 */
export function classifySignUpError(error: any): ClassifiedError {
  // Extrair mensagem de erro de diferentes estruturas
  let errorMessage = '';
  
  if (error?.message) {
    errorMessage = String(error.message);
  } else if (error?.error) {
    errorMessage = String(error.error);
  } else if (error?.response?.data?.error) {
    errorMessage = String(error.response.data.error);
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  // Normalizar para lowercase para comparação
  const normalizedMessage = errorMessage.toLowerCase();

  // Padrões para detecção de email_exists
  const emailPatterns = [
    'email',
    'já',
    'already',
    'exists',
    'cadastrado',
    'registered',
    'duplicate',
    'em uso',
    'em uso',
    'já está',
    'already exists',
    'already registered',
  ];

  // Padrões para detecção de CNPJ
  const cnpjPatterns = [
    'cnpj',
  ];
  const cnpjContextPatterns = [
    'já',
    'already',
    'exists',
    'duplicate',
    'unique constraint',
    'cadastrado',
  ];

  // Padrões para detecção de CPF
  const cpfPatterns = [
    'cpf',
  ];
  const cpfContextPatterns = [
    'já',
    'already',
    'exists',
    'duplicate',
    'unique constraint',
    'cadastrado',
  ];

  // Padrões para detecção de network_error
  const networkPatterns = [
    'network',
    'fetch',
    'connection',
    'timeout',
    'failed to fetch',
    'econnrefused',
    'econnreset',
    'enotfound',
    'networkerror',
    'network request failed',
  ];

  // Verificar se é erro de email
  const hasEmailPattern = emailPatterns.some(pattern => 
    normalizedMessage.includes(pattern)
  );
  
  // Verificar se é erro de CNPJ
  const hasCnpjPattern = cnpjPatterns.some(pattern => 
    normalizedMessage.includes(pattern)
  );
  const hasCnpjContext = hasCnpjPattern && cnpjContextPatterns.some(pattern =>
    normalizedMessage.includes(pattern)
  );

  // Verificar se é erro de CPF
  const hasCpfPattern = cpfPatterns.some(pattern => 
    normalizedMessage.includes(pattern)
  );
  const hasCpfContext = hasCpfPattern && cpfContextPatterns.some(pattern =>
    normalizedMessage.includes(pattern)
  );

  // Verificar se é erro de rede
  const hasNetworkPattern = networkPatterns.some(pattern => 
    normalizedMessage.includes(pattern)
  );

  // Verificar se é TypeError relacionado a fetch
  const isFetchTypeError = error instanceof TypeError && 
    (error.message?.toLowerCase().includes('fetch') || 
     error.message?.toLowerCase().includes('network'));

  // Classificar erro
  if (hasEmailPattern && !hasCnpjPattern && !hasCpfPattern) {
    return {
      type: 'email_exists',
      message: errorMessage || undefined,
      originalError: error,
    };
  }

  if (hasCnpjContext) {
    return {
      type: 'cnpj_exists',
      message: errorMessage || undefined,
      originalError: error,
    };
  }

  if (hasCpfContext) {
    return {
      type: 'cpf_exists',
      message: errorMessage || undefined,
      originalError: error,
    };
  }

  if (hasNetworkPattern || isFetchTypeError) {
    return {
      type: 'network_error',
      message: errorMessage || undefined,
      originalError: error,
    };
  }

  // Fallback para erro inesperado
  return {
    type: 'unexpected_error',
    message: errorMessage || undefined,
    originalError: error,
  };
}

