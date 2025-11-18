import rateLimit from 'express-rate-limit';

/**
 * Rate limiter geral para todas as rotas
 * Limites diferentes por ambiente:
 * - Development: 1000 req/15min (para suportar StrictMode e desenvolvimento ativo)
 * - Staging: 500 req/15min (para suportar polling de dashboard e múltiplos componentes)
 * - Production: 100 req/15min (limite mais restritivo)
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isStaging = process.env.NODE_ENV === 'staging' || process.env.RENDER_SERVICE_NAME?.includes('staging');
const maxRequests = isDevelopment ? 1000 : isStaging ? 500 : 100;

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: maxRequests, // máximo de requisições por IP (ajustado por ambiente)
  message: {
    error: 'Muitas requisições deste IP, tente novamente em alguns minutos.',
  },
  standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
  // Skip healthcheck endpoint para não contar requisições de monitoramento
  skip: (req) => {
    return req.path === '/' || req.path === '/health';
  },
});

/**
 * Rate limiter mais restritivo para autenticação
 * Limita a 5 tentativas por 15 minutos por IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo de 5 tentativas por IP
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
  skipSuccessfulRequests: true, // Não conta requisições bem-sucedidas
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter para criação de recursos
 * Limita a 10 criações por hora por IP
 */
export const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // máximo de 10 criações por IP
  message: {
    error: 'Muitas tentativas de criação. Tente novamente em uma hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter mais permissivo para rotas de estatísticas/dashboard
 * Essas rotas são chamadas frequentemente pelo dashboard e podem ser agrupadas
 * Limites por ambiente:
 * - Development: 500 req/15min
 * - Staging: 300 req/15min
 * - Production: 200 req/15min
 */
const statsMaxRequests = isDevelopment ? 500 : isStaging ? 300 : 200;

export const statsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: statsMaxRequests, // máximo de requisições por IP (ajustado por ambiente)
  message: {
    error: 'Muitas requisições de estatísticas. Tente novamente em alguns minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === '/' || req.path === '/health';
  },
});

