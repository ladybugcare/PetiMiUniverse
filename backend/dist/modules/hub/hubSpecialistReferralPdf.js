"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamValidatableSpecialistReferralPdf = streamValidatableSpecialistReferralPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const qrcode_1 = __importDefault(require("qrcode"));
const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BORDER = '#e5dcd6';
function drawField(doc, label, value, x, y, width) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text(label, x, y, { width });
    doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(value || '—', x, doc.y + 2, { width });
    return doc.y;
}
function truncateHash(hash, edge = 8) {
    if (hash.length <= edge * 2 + 1)
        return hash;
    return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}
function drawReferralBody(doc, snapshot, margin, pageW) {
    let y = margin;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT_DARK).text('Encaminhamento a especialista', margin, y);
    y = doc.y + 4;
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ORANGE).text(snapshot.clinic.name, margin, y);
    y = doc.y + 16;
    const colW = pageW / 2 - 8;
    drawField(doc, 'Pet', `${snapshot.pet.name} (${snapshot.pet.species ?? '—'})`, margin, y, colW);
    drawField(doc, 'Tutor', snapshot.guardian.full_name, margin + colW + 16, y, colW);
    y = doc.y + 12;
    const crmv = [snapshot.veterinarian.crmv, snapshot.veterinarian.crmv_uf].filter(Boolean).join('/');
    drawField(doc, 'Veterinário responsável', `${snapshot.veterinarian.full_name}${crmv ? ` · CRMV ${crmv}` : ''}`, margin, y, pageW);
    y = doc.y + 16;
    for (const ref of snapshot.referrals) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(ref.specialty, margin, y, { width: pageW });
        y = doc.y + 4;
        if (ref.specialist_name) {
            doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(`Destino: ${ref.specialist_name}`, margin, y, { width: pageW });
            y = doc.y + 2;
        }
        if (ref.specialist_contact) {
            doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(ref.specialist_contact, margin, y, { width: pageW });
            y = doc.y + 2;
        }
        doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('Motivo', margin, y);
        y = doc.y + 2;
        doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(ref.referral_reason, margin, y, { width: pageW });
        y = doc.y + 6;
        if (ref.clinical_summary) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('Resumo clínico', margin, y);
            y = doc.y + 2;
            doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(ref.clinical_summary, margin, y, { width: pageW });
            y = doc.y + 6;
        }
        if (ref.priority === 'urgent') {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(ORANGE).text('Prioridade: urgente', margin, y);
            y = doc.y + 8;
        }
        else {
            y += 8;
        }
    }
    return y;
}
async function streamValidatableSpecialistReferralPdf(res, snapshot, validation) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="encaminhamento-${validation.validation_code}.pdf"`);
    doc.pipe(res);
    const margin = 40;
    const pageW = doc.page.width - margin * 2;
    let y = drawReferralBody(doc, snapshot, margin, pageW);
    if (y > doc.page.height - 220) {
        doc.addPage();
        y = margin;
    }
    else {
        y += 24;
    }
    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 14;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Validação PetMi Hub', margin, y);
    y = doc.y + 8;
    const qrSize = 88;
    let qrBuffer = null;
    try {
        qrBuffer = await qrcode_1.default.toBuffer(validation.public_url, { type: 'png', margin: 1, width: qrSize });
    }
    catch {
        qrBuffer = null;
    }
    const metaX = margin + (qrBuffer ? qrSize + 16 : 0);
    const metaW = pageW - (qrBuffer ? qrSize + 16 : 0);
    if (qrBuffer)
        doc.image(qrBuffer, margin, y, { width: qrSize, height: qrSize });
    drawField(doc, 'Código de validação', validation.validation_code, metaX, y, metaW);
    y = Math.max(doc.y, y + (qrBuffer ? qrSize : 0)) + 6;
    drawField(doc, 'Identificador de integridade', truncateHash(validation.content_hash), metaX, y, metaW);
    y = doc.y + 6;
    const validity = validation.expires_at
        ? `Válida até ${new Date(validation.expires_at).toLocaleDateString('pt-BR')}`
        : `Emitida em ${new Date(validation.issued_at).toLocaleString('pt-BR')}`;
    drawField(doc, 'Validade', validity, metaX, y, metaW);
    y = doc.y + 14;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text('Avisos legais', margin, y);
    y = doc.y + 6;
    for (const line of validation.disclaimers) {
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_MUTED).text(`• ${line}`, margin, y, { width: pageW });
        y = doc.y + 4;
    }
    doc.end();
}
