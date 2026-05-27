"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureClinicSeesAllApplications = exports.ensureVetSeesOnlyOwnApplications = exports.applyPrivacyFilter = exports.filterApplicationsByRole = void 0;
const logger_js_1 = require("../utils/logger.js");
/**
 * Middleware para garantir privacidade entre candidatos
 * Vets/freelancers só veem suas próprias aplicações
 * Clínicas/admins veem todas as aplicações
 */
const filterApplicationsByRole = (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return next();
        }
        const userRole = user.role || user.user_metadata?.role;
        // Se for vet ou freelancer, adicionar filtro para ver apenas próprias aplicações
        if (userRole === 'vet' || userRole === 'freelancer') {
            // Adicionar filtro ao query string ou body
            if (req.query) {
                req.query.vet_id = user.id;
            }
            // Armazenar no request para uso nos controllers
            req.privacyFilter = {
                vet_id: user.id,
                freelancer_id: user.id,
            };
        }
        else if (userRole === 'clinic' || userRole === 'admin') {
            // Clínicas e admins veem tudo - não adicionar filtro
            req.privacyFilter = null;
        }
        next();
    }
    catch (error) {
        logger_js_1.logger.error('Erro no privacyGuard', {
            error: error.message,
            path: req.path,
            correlationId: req.correlationId,
        });
        next();
    }
};
exports.filterApplicationsByRole = filterApplicationsByRole;
/**
 * Helper para aplicar filtro de privacidade em queries Supabase
 */
const applyPrivacyFilter = (query, req) => {
    const privacyFilter = req.privacyFilter;
    if (!privacyFilter) {
        return query; // Clínica ou admin - sem filtro
    }
    // Vet ou freelancer - filtrar por próprio ID
    if (privacyFilter.vet_id) {
        return query.eq('vet_id', privacyFilter.vet_id);
    }
    if (privacyFilter.freelancer_id) {
        return query.eq('freelancer_id', privacyFilter.freelancer_id);
    }
    return query;
};
exports.applyPrivacyFilter = applyPrivacyFilter;
/**
 * Middleware específico para garantir que vet só vê próprias aplicações
 */
const ensureVetSeesOnlyOwnApplications = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const userRole = user.role || user.user_metadata?.role;
    if (userRole === 'vet' || userRole === 'freelancer') {
        // Adicionar filtro obrigatório
        req.privacyFilter = {
            vet_id: user.id,
            freelancer_id: user.id,
        };
    }
    next();
};
exports.ensureVetSeesOnlyOwnApplications = ensureVetSeesOnlyOwnApplications;
/**
 * Middleware específico para garantir que clínica vê todas as aplicações
 */
const ensureClinicSeesAllApplications = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const userRole = user.role || user.user_metadata?.role;
    if (userRole !== 'clinic' && userRole !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    // Não adicionar filtro - clínica vê tudo
    req.privacyFilter = null;
    next();
};
exports.ensureClinicSeesAllApplications = ensureClinicSeesAllApplications;
