"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
/**
 * Configuração do logger usando Winston
 * Diferentes níveis de log para desenvolvimento e produção
 */
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json());
// Formato para desenvolvimento (mais legível)
const devFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
}));
exports.logger = winston_1.default.createLogger({
    level: logLevel,
    format: process.env.NODE_ENV === 'production' ? logFormat : devFormat,
    defaultMeta: { service: 'petivet-api' },
    transports: [
        // Escrever todos os logs em console
        new winston_1.default.transports.Console({
            stderrLevels: ['error'],
        }),
        // Em produção, também escrever erros em arquivo
        ...(process.env.NODE_ENV === 'production'
            ? [
                new winston_1.default.transports.File({
                    filename: 'logs/error.log',
                    level: 'error',
                }),
                new winston_1.default.transports.File({
                    filename: 'logs/combined.log',
                }),
            ]
            : []),
    ],
});
// Se não estiver em produção, adicionar logs mais verbosos
if (process.env.NODE_ENV !== 'production') {
    exports.logger.debug('Logger initialized in development mode');
}
