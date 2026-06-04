"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingInvites = exports.rejectInvite = exports.acceptInvite = exports.inviteVet = void 0;
const inviteService_js_1 = require("../services/inviteService.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Controller para gerenciar convites de demandas
 */
/**
 * Convidar um veterinário para uma demanda
 * POST /demands/:id/invite-vet
 */
exports.inviteVet = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: demandId } = req.params;
    const { vet_id: vetId } = req.body;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    if (!vetId) {
        throw new errors_js_1.ValidationError('vet_id é obrigatório');
    }
    const application = await inviteService_js_1.InviteService.inviteVetToDemand(demandId, vetId, user.id);
    logger_js_1.logger.info('Vet convidado com sucesso', {
        demandId,
        vetId,
        invitedBy: user.id,
        applicationId: application.id,
        correlationId: req.correlationId,
    });
    res.status(201).json({
        message: 'Veterinário convidado com sucesso',
        application,
    });
});
/**
 * Aceitar um convite
 * POST /demand-applications/:id/accept-invite
 */
exports.acceptInvite = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: applicationId } = req.params;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    const application = await inviteService_js_1.InviteService.acceptInvite(applicationId, user.id);
    logger_js_1.logger.info('Convite aceito com sucesso', {
        applicationId,
        vetId: user.id,
        correlationId: req.correlationId,
    });
    res.json({
        message: 'Convite aceito com sucesso',
        application,
    });
});
/**
 * Recusar um convite
 * POST /demand-applications/:id/reject-invite
 */
exports.rejectInvite = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: applicationId } = req.params;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    const application = await inviteService_js_1.InviteService.rejectInvite(applicationId, user.id);
    logger_js_1.logger.info('Convite recusado com sucesso', {
        applicationId,
        vetId: user.id,
        correlationId: req.correlationId,
    });
    res.json({
        message: 'Convite recusado',
        application,
    });
});
/**
 * Listar convites pendentes do veterinário logado
 * GET /demand-applications/invites/pending
 */
exports.getPendingInvites = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    const applications = await inviteService_js_1.InviteService.getInvitesByVet(user.id);
    res.json({
        applications,
        count: applications.length,
    });
});
