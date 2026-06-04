import winston from 'winston';

/**
 * Configuração do logger usando Winston
 * Diferentes níveis de log para desenvolvimento e produção
 */
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Formato para desenvolvimento (mais legível)
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

export const logger = winston.createLogger({
  level: logLevel,
  format: process.env.NODE_ENV === 'production' ? logFormat : devFormat,
  defaultMeta: { service: 'petivet-api' },
  transports: [
    // Produção na Railway: só stdout/stderr (sem ficheiros em disco efémero)
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

// Se não estiver em produção, adicionar logs mais verbosos
if (process.env.NODE_ENV !== 'production') {
  logger.debug('Logger initialized in development mode');
}

