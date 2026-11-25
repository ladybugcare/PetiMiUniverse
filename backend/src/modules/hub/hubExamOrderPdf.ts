import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import type { ExamOrderSnapshot } from './examOrderValidation';
import {
  CLINICAL_PDF,
  drawCenteredDocumentTitle,
  drawClinicHeaderRight,
  drawClinicalStampBlock,
  drawPartyIdentification,
  drawValidationFooter,
  type ClinicalPdfValidationMeta,
} from './hubClinicalValidatablePdf';

export type ExamOrderValidationMeta = ClinicalPdfValidationMeta;

function drawExamItems(
  doc: InstanceType<typeof PDFDocument>,
  snapshot: ExamOrderSnapshot,
  margin: number,
  pageW: number,
  y: number,
): number {
  doc.font('Helvetica-Bold').fontSize(12).fillColor(CLINICAL_PDF.textDark).text('EXAMES SOLICITADOS', margin, y);
  y = doc.y + 10;

  for (const exam of snapshot.exams) {
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = margin;
    }

    const urgency =
      exam.urgency === 'urgent' ? ' (urgente)' : exam.urgency === 'routine' ? '' : '';
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(CLINICAL_PDF.textDark)
      .text(exam.exam_type + urgency, margin, y, { width: pageW });
    y = doc.y + 4;

    const lab =
      exam.lab_kind === 'external'
        ? exam.external_lab_name ?? exam.lab_name ?? 'Laboratório externo'
        : exam.lab_name ?? 'Laboratório interno';
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(CLINICAL_PDF.textDark)
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

export async function streamValidatableExamOrderPdf(
  res: Response,
  snapshot: ExamOrderSnapshot,
  validation: ExamOrderValidationMeta,
): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: CLINICAL_PDF.margin, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="exames-${validation.validation_code}.pdf"`);
  doc.pipe(res);

  const margin = CLINICAL_PDF.margin;
  const pageW = doc.page.width - margin * 2;

  let y = drawClinicHeaderRight(doc, {
    margin,
    pageW,
    clinic: snapshot.clinic,
    veterinarian: snapshot.veterinarian,
  });
  y = drawCenteredDocumentTitle(doc, 'Solicitação de exames', margin, pageW, y);
  y = drawPartyIdentification(doc, {
    margin,
    pageW,
    y,
    pet: snapshot.pet,
    guardian: snapshot.guardian,
    issuedAt: validation.issued_at ?? snapshot.issued_at,
    expiresAt: validation.expires_at,
  });
  y = drawExamItems(doc, snapshot, margin, pageW, y);
  y = await drawClinicalStampBlock(doc, snapshot.veterinarian, { margin, pageW, y });
  await drawValidationFooter(doc, validation, { margin, pageW, y });

  doc.end();
}
