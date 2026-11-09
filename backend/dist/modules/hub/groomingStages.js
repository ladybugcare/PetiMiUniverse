"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROOMING_EVENT_TITLES = exports.GROOMING_NEXT_STAGE = exports.GROOMING_STAGE_LABELS = exports.GROOMING_STAGES = void 0;
exports.canTransitionGroomingStage = canTransitionGroomingStage;
exports.appointmentStatusForGroomingStage = appointmentStatusForGroomingStage;
exports.boardStageFromAppointmentStatus = boardStageFromAppointmentStatus;
exports.GROOMING_STAGES = [
    'scheduled',
    'checked_in',
    'queued',
    'in_service',
    'finishing',
    'ready',
    'delivered',
    'closed',
];
exports.GROOMING_STAGE_LABELS = {
    scheduled: 'Agendado',
    checked_in: 'Check-in',
    queued: 'Aguardando',
    in_service: 'Em atendimento',
    finishing: 'Finalização',
    ready: 'Pronto',
    delivered: 'Entregue',
    closed: 'Encerrado',
};
/**
 * Próximo estágio na ação rápida «Avançar».
 * Caminho do salão: fila → em serviço → pronto.
 * `closed` é custódia (recepção, motorista ou estadia), não a fila do tosador.
 * `finishing` / `delivered` ficam no enum só para sessões antigas.
 */
exports.GROOMING_NEXT_STAGE = {
    scheduled: 'queued',
    checked_in: 'queued',
    queued: 'in_service',
    in_service: 'ready',
    finishing: 'ready',
};
const ALLOWED_TRANSITIONS = {
    scheduled: ['checked_in', 'queued'],
    checked_in: ['queued', 'scheduled'],
    queued: ['in_service', 'checked_in'],
    in_service: ['ready', 'finishing', 'queued'],
    finishing: ['ready', 'in_service'],
    ready: ['closed', 'delivered', 'finishing', 'in_service'],
    delivered: ['closed', 'ready'],
    closed: [],
};
function canTransitionGroomingStage(from, to) {
    if (from === to)
        return true;
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
function appointmentStatusForGroomingStage(stage) {
    switch (stage) {
        case 'scheduled':
            return 'confirmed';
        case 'checked_in':
        case 'queued':
            // Pet na unidade / na fila — ainda não em serviço no salão.
            return 'checked_in';
        case 'in_service':
        case 'finishing':
            return 'in_progress';
        case 'ready':
        case 'delivered':
        case 'closed':
            // Encerrado operacionalmente espelha agenda `done`; `paid` só após quitação no caixa.
            return 'done';
        default:
            return null;
    }
}
function boardStageFromAppointmentStatus(status, appointmentKind) {
    // Encaixe já fez check-in na agenda; na fila entra em Aguardando até existir sessão.
    if (appointmentKind === 'walk_in' && (status === 'checked_in' || status === 'in_progress')) {
        return 'queued';
    }
    if (status === 'pending_confirm' || status === 'confirmed')
        return 'scheduled';
    if (status === 'checked_in')
        return 'queued';
    if (status === 'in_progress')
        return 'in_service';
    if (status === 'done')
        return 'ready';
    // `paid` = quitação financeira; sessão pode já ter sido encerrada operacionalmente.
    if (status === 'paid')
        return 'closed';
    return 'scheduled';
}
exports.GROOMING_EVENT_TITLES = {
    check_in: 'Check-in realizado',
    start: 'Atendimento iniciado',
    pause: 'Atendimento pausado',
    resume: 'Atendimento retomado',
    staff_change: 'Profissional alterado',
    stage_change: 'Estágio atualizado',
    note: 'Observação',
    extra_request: 'Pedido de serviço',
    ready: 'Pet pronto',
    delivered: 'Pet entregue',
    closed: 'Atendimento encerrado',
};
