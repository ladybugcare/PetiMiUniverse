"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamValidatableExamOrderPdf = streamValidatableExamOrderPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const hubClinicalValidatablePdf_1 = require("./hubClinicalValidatablePdf");
function drawExamItems(doc, snapshot, margin, pageW, y) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark).text('EXAMES SOLICITADOS', margin, y);
    y = doc.y + 10;
    for (const exam of snapshot.exams) {
        if (y > doc.page.height - 140) {
            doc.addPage();
            y = margin;
        }
        const urgency = exam.urgency === 'urgent' ? ' (urgente)' : exam.urgency === 'routine' ? '' : '';
        doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark)
            .text(exam.exam_type + urgency, margin, y, { width: pageW });
        y = doc.y + 4;
        const lab = exam.lab_kind === 'external'
            ? exam.external_lab_name ?? exam.lab_name ?? 'Laboratório externo'
            : exam.lab_name ?? 'Laboratório interno';
        doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(hubClinicalValidatablePdf_1.CLINICAL_PDF.textDark)
            .text(`Laboratório: ${lab}`, margin, y, { width: pageW });
        y = doc.y + 2;
        if (exam.clinical_indication?.trim()) {
            doc.text(`Indicação clínica: ${exam.clinical_indication.trim()}`, margin, y, { width: pageW });
            y = doc.y + 2;
        }
        if (exam.fasting_required) {
            doc.text('Jejum necessário', margin, y, { width: pageW });
            y = doc.y + 2;
        }
        if (exam.collection_instructions?.trim()) {
            doc.text(`Coleta: ${exam.collection_instructions.trim()}`, margin, y, { width: pageW });
            y = doc.y + 2;
        }
        if (exam.notes?.trim()) {
            doc.text(`Observações: ${exam.notes.trim()}`, margin, y, { width: pageW });
            y = doc.y + 2;
        }
        y += 10;
    }
    return y;
}
async function streamValidatableExamOrderPdf(res, snapshot, validation) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: hubClinicalValidatablePdf_1.CLINICAL_PDF.margin, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="exames-${validation.validation_code}.pdf"`);
    doc.pipe(res);
    const margin = hubClinicalValidatablePdf_1.CLINICAL_PDF.margin;
    const pageW = doc.page.width - margin * 2;
    let y = (0, hubClinicalValidatablePdf_1.drawClinicHeaderRight)(doc, {
        margin,
        pageW,
        clinic: snapshot.clinic,
        veterinarian: snapshot.veterinarian,
    });
    y = (0, hubClinicalValidatablePdf_1.drawCenteredDocumentTitle)(doc, 'Solicitação de exames', margin, pageW, y);
    y = (0, hubClinicalValidatablePdf_1.drawPartyIdentification)(doc, {
        margin,
        pageW,
        y,
        pet: snapshot.pet,
        guardian: snapshot.guardian,
        issuedAt: validation.issued_at ?? snapshot.issued_at,
        expiresAt: validation.expires_at,
    });
    y = drawExamItems(doc, snapshot, margin, pageW, y);
    y = await (0, hubClinicalValidatablePdf_1.drawClinicalStampBlock)(doc, snapshot.veterinarian, { margin, pageW, y });
    await (0, hubClinicalValidatablePdf_1.drawValidationFooter)(doc, validation, { margin, pageW, y });
    doc.end();
}
