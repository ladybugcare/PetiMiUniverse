"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamPrescriptionPdf = streamPrescriptionPdf;
exports.streamValidatablePrescriptionPdf = streamValidatablePrescriptionPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const qrcode_1 = __importDefault(require("qrcode"));
const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BORDER = '#e5dcd6';
const BEIGE = '#faf3ee';
function embedOne(x) {
    if (x == null)
        return null;
    return Array.isArray(x) ? (x[0] ?? null) : x;
}
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
function drawPrescriptionBody(doc, prescription, margin, pageW) {
    const clinic = embedOne(prescription.clinic);
    const pet = embedOne(prescription.pet);
    const guardian = embedOne(prescription.guardian);
    const staff = embedOne(prescription.staff);
    const items = [...(prescription.items ?? [])].sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
    let y = margin;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT_DARK).text('Receita veterinária', margin, y);
    y = doc.y + 4;
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ORANGE).text(clinic?.name || 'Clínica veterinária', margin, y);
    y = doc.y + 4;
    doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(TEXT_MUTED)
        .text([clinic?.phone, clinic?.email].filter(Boolean).join(' · ') || 'PetiMi Hub', margin, y);
    y = doc.y + 16;
    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 16;
    doc.save().roundedRect(margin, y, pageW, 92, 8).fill(BEIGE).restore();
    const colW = (pageW - 24) / 3;
    let fy = y + 14;
    drawField(doc, 'Paciente', pet?.name || '—', margin + 14, fy, colW);
    drawField(doc, 'Espécie / raça', [pet?.species, pet?.breed].filter(Boolean).join(' · ') || '—', margin + 14 + colW + 12, fy, colW);
    drawField(doc, 'Tutor', guardian?.full_name || '—', margin + 14 + (colW + 12) * 2, fy, colW);
    fy = Math.max(doc.y, y + 56);
    drawField(doc, 'Data', prescription.prescribed_at ? new Date(prescription.prescribed_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'), margin + 14, fy, colW);
    drawField(doc, 'Telefone tutor', guardian?.phone || '—', margin + 14 + colW + 12, fy, colW);
    y += 112;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT_DARK).text('Medicamentos e orientações', margin, y);
    y = doc.y + 10;
    for (const [idx, item] of items.entries()) {
        if (y > doc.page.height - 180) {
            doc.addPage();
            y = margin;
        }
        doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(`${idx + 1}. ${item.medication_name}`, margin, y);
        y = doc.y + 4;
        const parts = [
            item.presentation ? `Apresentação: ${item.presentation}` : null,
            item.concentration ? `Concentração: ${item.concentration}` : item.dosage ? `Dose: ${item.dosage}` : null,
            item.quantity ? `Quantidade: ${item.quantity}` : null,
            item.posology ? `Posologia: ${item.posology}` : item.frequency ? `Frequência: ${item.frequency}` : null,
            item.duration ? `Duração: ${item.duration}` : null,
        ].filter(Boolean);
        if (parts.length) {
            doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(parts.join(' · '), margin + 14, y, { width: pageW - 14 });
            y = doc.y + 3;
        }
        if (item.instructions) {
            doc.font('Helvetica').fontSize(10).fillColor(TEXT_MUTED).text(item.instructions, margin + 14, y, { width: pageW - 14 });
            y = doc.y + 8;
        }
        else {
            y += 6;
        }
    }
    if (prescription.notes) {
        y += 10;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Observações', margin, y);
        y = doc.y + 6;
        doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(prescription.notes, margin, y, { width: pageW });
        y = doc.y + 16;
    }
    const signY = Math.max(y + 36, doc.page.height - 180);
    doc.moveTo(margin + 120, signY).lineTo(doc.page.width - margin - 120, signY).strokeColor(BORDER).stroke();
    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(TEXT_DARK)
        .text(staff?.full_name || 'Veterinário responsável', margin, signY + 8, { width: pageW, align: 'center' });
    const crmv = [staff?.crmv ? `CRMV ${staff.crmv}` : null, staff?.crmv_uf || null].filter(Boolean).join(' / ');
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(crmv || 'CRMV não informado', margin, doc.y + 2, { width: pageW, align: 'center' });
    return doc.y;
}
function streamPrescriptionPdf(res, prescription) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receita-${prescription.id.slice(0, 8)}.pdf"`);
    doc.pipe(res);
    drawPrescriptionBody(doc, prescription, 40, doc.page.width - 80);
    doc.end();
}
async function streamValidatablePrescriptionPdf(res, prescription, validation) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receita-${validation.validation_code}.pdf"`);
    doc.pipe(res);
    const margin = 40;
    const pageW = doc.page.width - margin * 2;
    let y = drawPrescriptionBody(doc, prescription, margin, pageW);
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
    if (qrBuffer) {
        doc.image(qrBuffer, margin, y, { width: qrSize, height: qrSize });
    }
    drawField(doc, 'Código de validação', validation.validation_code, metaX, y, metaW);
    y = Math.max(doc.y, y + (qrBuffer ? qrSize : 0)) + 6;
    drawField(doc, 'Identificador de integridade', truncateHash(validation.content_hash), metaX, y, metaW);
    y = doc.y + 6;
    const validity = validation.expires_at
        ? `Válida até ${new Date(validation.expires_at).toLocaleDateString('pt-BR')}`
        : `Emitida em ${new Date(validation.issued_at).toLocaleString('pt-BR')}`;
    drawField(doc, 'Validade', validity, metaX, y, metaW);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_MUTED).text(validation.public_url, metaX, y, { width: metaW });
    y = doc.y + 14;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text('Avisos legais', margin, y);
    y = doc.y + 6;
    for (const line of validation.disclaimers) {
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_MUTED).text(`• ${line}`, margin, y, { width: pageW });
        y = doc.y + 4;
    }
    doc.end();
}
