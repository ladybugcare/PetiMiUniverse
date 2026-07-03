"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeRecordPrescriptionViewed = maybeRecordPrescriptionViewed;
exports.recordPrescriptionPdfDownloaded = recordPrescriptionPdfDownloaded;
const prescriptionDocumentIssue_1 = require("./prescriptionDocumentIssue");
const VIEW_DEBOUNCE_MS = 60 * 60 * 1000;
const viewDebounce = new Map();
function clientIp(req) {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
function clientUserAgent(req) {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' && ua.trim() ? ua.trim().slice(0, 500) : null;
}
async function maybeRecordPrescriptionViewed(req, clinicId, documentId) {
    const ip = clientIp(req);
    const key = `${documentId}:${ip}`;
    const now = Date.now();
    const last = viewDebounce.get(key);
    if (last != null && now - last < VIEW_DEBOUNCE_MS)
        return;
    viewDebounce.set(key, now);
    await (0, prescriptionDocumentIssue_1.recordPrescriptionDocumentEvent)({
        clinic_id: clinicId,
        document_id: documentId,
        event_type: 'viewed',
        actor_ip: ip,
        actor_user_agent: clientUserAgent(req),
    });
}
async function recordPrescriptionPdfDownloaded(req, clinicId, documentId) {
    await (0, prescriptionDocumentIssue_1.recordPrescriptionDocumentEvent)({
        clinic_id: clinicId,
        document_id: documentId,
        event_type: 'pdf_downloaded',
        actor_ip: clientIp(req),
        actor_user_agent: clientUserAgent(req),
    });
}
