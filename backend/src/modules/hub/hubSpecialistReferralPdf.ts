import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import type { SpecialistReferralSnapshot } from './specialistReferralValidation';
import {
  CLINICAL_PDF,
  drawCenteredDocumentTitle,
  drawClinicHeaderRight,
  drawClinicalStampBlock,
  drawPartyIdentification,
  drawValidationFooter,
  type ClinicalPdfValidationMeta,
} from './hubClinicalValidatablePdf';

export type SpecialistReferralValidationMeta = ClinicalPdfValidationMeta;

function drawReferralItems(
  doc: InstanceType<typeof PDFDocument>,
  snapshot: SpecialistReferralSnapshot,
  margin: number,
  pageW: number,
  y: number,
): number {
  doc.font('Helvetica-Bold').fontSize(12).fillColor(CLINICAL_PDF.textDark).text('ENCAMINHAMENTO', margin, y);
  y = doc.y + 10;

  for (const ref of snapshot.referrals) {
    if (y > doc.page.height - 160) {
      doc.addPage();
      y = margin;
    }

    const title =
      ref.priority === 'urgent' ? `${ref.specialty} — Prioridade urgente` : ref.specialty;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(CLINICAL_PDF.textDark).text(title, margin, y, {
      width: pageW,
    });
    y = doc.y + 6;

    if (ref.specialist_name?.trim()) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(CLINICAL_PDF.textDark)
        .text(`Destino: ${ref.specialist_name.trim()}`, margin, y, { width: pageW });
      y = doc.y + 2;
    }
    if (ref.specialist_contact?.trim()) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(CLINICAL_PDF.textMuted)
        .text(ref.specialist_contact.trim(), margin, y, { width: pageW });
      y = doc.y + 2;
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor(CLINICAL_PDF.textDark).text('Motivo', margin, y);
    y = doc.y + 2;
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(CLINICAL_PDF.textDark)
      .text(ref.referral_reason, margin, y, { width: pageW });
    y = doc.y + 6;

    if (ref.clinical_summary?.trim()) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(CLINICAL_PDF.textDark)
        .text('Resumo clínico', margin, y);
      y = doc.y + 2;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(CLINICAL_PDF.textDark)
        .text(ref.clinical_summary.trim(), margin, y, { width: pageW });
      y = doc.y + 6;
    }

    if (ref.notes?.trim()) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(CLINICAL_PDF.textDark).text('Observações', margin, y);
      y = doc.y + 2;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(CLINICAL_PDF.textDark)
        .text(ref.notes.trim(), margin, y, { width: pageW });
      y = doc.y + 6;
    }

    y += 8;
  }

  return y;
}

export async function streamValidatableSpecialistReferralPdf(
  res: Response,
  snapshot: SpecialistReferralSnapshot,
  validation: SpecialistReferralValidationMeta,
): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: CLINICAL_PDF.margin, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="encaminhamento-${validation.validation_code}.pdf"`,
  );
  doc.pipe(res);

  const margin = CLINICAL_PDF.margin;
  const pageW = doc.page.width - margin * 2;

  let y = drawClinicHeaderRight(doc, {
    margin,
    pageW,
    clinic: snapshot.clinic,
    veterinarian: snapshot.veterinarian,
  });
  y = drawCenteredDocumentTitle(doc, 'Encaminhamento a especialista', margin, pageW, y);
  y = drawPartyIdentification(doc, {
    margin,
    pageW,
    y,
    pet: snapshot.pet,
    guardian: snapshot.guardian,
    issuedAt: validation.issued_at ?? snapshot.issued_at,
    expiresAt: validation.expires_at,
  });
  y = drawReferralItems(doc, snapshot, margin, pageW, y);
  y = await drawClinicalStampBlock(doc, snapshot.veterinarian, { margin, pageW, y });
  await drawValidationFooter(doc, validation, { margin, pageW, y });

  doc.end();
}
