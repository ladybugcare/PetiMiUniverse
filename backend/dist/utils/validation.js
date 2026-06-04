"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commonSchemas = exports.validate = void 0;
const zod_1 = require("zod");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
/**
 * Middleware de validação usando Zod
 * Valida o body, params ou query da requisição
 */
const validate = (schema, source = 'body') => {
    return (req, res, next) => {
        try {
            const data = source === 'body' ? req.body : source === 'params' ? req.params : req.query;
            // Validar dados
            const validated = schema.parse(data);
            // Substituir dados originais pelos validados
            if (source === 'body') {
                req.body = validated;
            }
            else if (source === 'params') {
                req.params = validated;
            }
            else {
                req.query = validated;
            }
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const errors = error.issues.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message,
                }));
                return next((0, errorHandler_js_1.createError)(`Erro de validação: ${errors.map((e) => e.message).join(', ')}`, 400, true));
            }
            next(error);
        }
    };
};
exports.validate = validate;
/**
 * Schemas de validação comuns
 */
exports.commonSchemas = {
    uuid: zod_1.z.string().uuid('ID inválido'),
    email: zod_1.z.string().email('Email inválido'),
    cnpj: zod_1.z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
    phone: zod_1.z.string().regex(/^\+?[\d\s-()]+$/, 'Telefone inválido'),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
    time: zod_1.z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:MM'),
};
