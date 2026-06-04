"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkProof = exports.approveReport = exports.submitReport = exports.checkOut = exports.checkIn = void 0;
const workProofService_js_1 = require("../services/workProofService.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Controller para gerenciar prova de trabalho (check-in, check-out, relatórios)
 */
/**
 * Fazer check-in
 * POST /demand-applications/:id/checkin
 */
exports.checkIn = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: applicationId } = req.params;
    const { location } = req.body;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    const workProof = await workProofService_js_1.WorkProofService.checkIn(applicationId, location);
    logger_js_1.logger.info('Check-in realizado com sucesso', {
        applicationId,
        userId: user.id,
        hasLocation: !!location,
        correlationId: req.correlationId,
    });
    res.json({
        message: 'Check-in realizado com sucesso',
        workProof,
    });
});
/**
 * Fazer check-out
 * POST /demand-applications/:id/checkout
 */
exports.checkOut = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: applicationId } = req.params;
    const { location } = req.body;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    const workProof = await workProofService_js_1.WorkProofService.checkOut(applicationId, location);
    logger_js_1.logger.info('Check-out realizado com sucesso', {
        applicationId,
        userId: user.id,
        hasLocation: !!location,
        correlationId: req.correlationId,
    });
    res.json({
        message: 'Check-out realizado com sucesso',
        workProof,
    });
});
/**
 * Enviar relatório
 * POST /demand-applications/:id/report
 */
exports.submitReport = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: applicationId } = req.params;
    const { report_text: reportText, attachments } = req.body;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    if (!reportText || reportText.trim().length === 0) {
        throw new errors_js_1.ValidationError('report_text é obrigatório');
    }
    const workProof = await workProofService_js_1.WorkProofService.submitReport(applicationId, reportText, attachments);
    logger_js_1.logger.info('Relatório enviado com sucesso', {
        applicationId,
        userId: user.id,
        hasAttachments: attachments && attachments.length > 0,
        correlationId: req.correlationId,
    });
    res.json({
        message: 'Relatório enviado com sucesso',
        workProof,
    });
});
/**
 * Aprovar relatório
 * POST /demand-applications/:id/approve-report
 */
exports.approveReport = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: applicationId } = req.params;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    const application = await workProofService_js_1.WorkProofService.approveReport(applicationId, user.id);
    logger_js_1.logger.info('Relatório aprovado com sucesso', {
        applicationId,
        approvedBy: user.id,
        correlationId: req.correlationId,
    });
    res.json({
        message: 'Relatório aprovado com sucesso',
        application,
    });
});
/**
 * Obter prova de trabalho
 * GET /demand-applications/:id/work-proof
 */
exports.getWorkProof = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id: applicationId } = req.params;
    const user = req.user;
    if (!user) {
        throw new errors_js_1.UnauthorizedError('Usuário não autenticado');
    }
    const workProof = await workProofService_js_1.WorkProofService.getWorkProof(applicationId);
    if (!workProof) {
        return res.status(404).json({
            error: 'Prova de trabalho não encontrada',
        });
    }
    res.json({
        workProof,
    });
});
