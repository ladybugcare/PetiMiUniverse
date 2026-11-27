"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamValidatableSpecialistReferralPdf = streamValidatableSpecialistReferralPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const hubClinicalValidatablePdf_1 = require("./hubClinicalValidatablePdf");
function drawReferralItems(doc, snapshot, margin, pageW, y) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark).text('ENCAMINHAMENTO', margin, y);
    y = doc.y + 10;
    for (const ref of snapshot.referrals) {
        if (y > doc.page.height - 160) {
            doc.addPage();
            y = margin;
        }
        const title = ref.priority === 'urgent' ? `${ref.specialty} — Prioridade urgente` : ref.specialty;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark).text(title, margin, y, {
            width: pageW,
        });
        y = doc.y + 6;
        if (ref.specialist_name?.trim()) {
            doc
                .font('Helvetica')
                .fontSize(10)
                .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark)
                .text(`Destino: ${ref.specialist_name.trim()}`, margin, y, { width: pageW });
            y = doc.y + 2;
        }
        if (ref.specialist_contact?.trim()) {
            doc
                .font('Helvetica')
                .fontSize(10)
                .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textMuted)
                .text(ref.specialist_contact.trim(), margin, y, { width: pageW });
            y = doc.y + 2;
        }
        doc.font('Helvetica-Bold').fontSize(10).fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark).text('Motivo', margin, y);
        y = doc.y + 2;
        doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark)
            .text(ref.referral_reason, margin, y, { width: pageW });
        y = doc.y + 6;
        if (ref.clinical_summary?.trim()) {
            doc
                .font('Helvetica-Bold')
                .fontSize(10)
                .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark)
                .text('Resumo clínico', margin, y);
            y = doc.y + 2;
            doc
                .font('Helvetica')
                .fontSize(10)
                .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark)
                .text(ref.clinical_summary.trim(), margin, y, { width: pageW });
            y = doc.y + 6;
        }
        if (ref.notes?.trim()) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark).text('Observações', margin, y);
            y = doc.y + 2;
            doc
                .font('Helvetica')
                .fontSize(10)
                .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark)
                .text(ref.notes.trim(), margin, y, { width: pageW });
            y = doc.y + 6;
        }
        y += 8;
    }
    return y;
}
async function streamValidatableSpecialistReferralPdf(res, snapshot, validation) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: hubClinicalValidatablePdf_1.CLINICAL_PDF.margin, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="encaminhamento-${validation.validation_code}.pdf"`);
    doc.pipe(res);
    const margin = hubClinicalValidatablePdf_1.CLINICAL_PDF.margin;
    const pageW = doc.page.width - margin * 2;
    let y = (0, hubClinicalValidatablePdf_1.drawClinicHeaderRight)(doc, {
        margin,
        pageW,
        clinic: snapshot.clinic,
        veterinarian: snapshot.veterinarian,
    });
    y = (0, hubClinicalValidatablePdf_1.drawCenteredDocumentTitle)(doc, 'Encaminhamento a especialista', margin, pageW, y);
    y = (0, hubClinicalValidatablePdf_1.drawPartyIdentification)(doc, {
        margin,
        pageW,
        y,
        pet: snapshot.pet,
        guardian: snapshot.guardian,
        issuedAt: validation.issued_at ?? snapshot.issued_at,
        expiresAt: validation.expires_at,
    });
    y = drawReferralItems(doc, snapshot, margin, pageW, y);
    y = await (0, hubClinicalValidatablePdf_1.drawClinicalStampBlock)(doc, snapshot.veterinarian, { margin, pageW, y });
    await (0, hubClinicalValidatablePdf_1.drawValidationFooter)(doc, validation, { margin, pageW, y });
    doc.end();
}
