"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeBody = exports.sanitizeInputs = void 0;
const inputSanitization_js_1 = require("../utils/inputSanitization.js");
/**
 * Middleware para sanitizar inputs do usuário automaticamente
 * Aplica sanitização em body, query e params
 */
const sanitizeInputs = (req, res, next) => {
    // Sanitizar body
    if (req.body && typeof req.body === 'object') {
        req.body = (0, inputSanitization_js_1.sanitizeObject)(req.body, false);
    }
    // Sanitizar query params (strings)
    if (req.query) {
        for (const key in req.query) {
            if (typeof req.query[key] === 'string') {
                req.query[key] = (0, inputSanitization_js_1.sanitizeString)(req.query[key], false);
            }
        }
    }
    // Sanitizar params (strings)
    if (req.params) {
        for (const key in req.params) {
            if (typeof req.params[key] === 'string') {
                req.params[key] = (0, inputSanitization_js_1.sanitizeString)(req.params[key], false);
            }
        }
    }
    next();
};
exports.sanitizeInputs = sanitizeInputs;
/**
 * Middleware para sanitizar apenas body (útil para rotas específicas)
 */
const sanitizeBody = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        req.body = (0, inputSanitization_js_1.sanitizeObject)(req.body, false);
    }
    next();
};
exports.sanitizeBody = sanitizeBody;
