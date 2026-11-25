/**
 * Layout compartilhado dos PDFs clínicos validáveis (receituário, exames, encaminhamento).
 * Padrão visual: cabeçalho da clínica à direita, título central, identificação em 2 colunas,
 * bloco de assinatura/carimbo e rodapé de validação com QR.
 */
import type PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
  formatAgeFromBirthDate,
  formatClinicAddress,
  formatGuardianAddress,
  formatTaxIdDisplay,
  type PrescriptionSnapshotClinic,
  type PrescriptionSnapshotGuardian,
  type PrescriptionSnapshotPet,
} from './prescriptionValidation';
import { drawVetStampBlock, loadVetStampBuffers, type VetStampPdfParty } from './hubVetStampPdf';

export type PdfDoc = InstanceType<typeof PDFDocument>;

export const CLINICAL_PDF = {
  textDark: '#222222',
  textMuted: '#666666',
  border: '#333333',
  margin: 48,
} as const;

export type ClinicalPdfClinic = PrescriptionSnapshotClinic & { id: string; name: string };
export type ClinicalPdfPet = PrescriptionSnapshotPet;
export type ClinicalPdfGuardian = PrescriptionSnapshotGuardian;

export type ClinicalPdfValidationMeta = {
  validation_code: string;
  public_url: string;
  content_hash: string;
  issued_at: string;
  expires_at?: string | null;
  disclaimers: string[];
};

export function truncateHash(hash: string, edge = 8): string {
  if (hash.length <= edge * 2 + 1) return hash;
  return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}

export function drawLabelValue(
  doc: PdfDoc,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(CLINICAL_PDF.textDark).text(`${label}: `, x, y, {
    width,
    continued: true,
  });
  doc.font('Helvetica').fontSize(10).fillColor(CLINICAL_PDF.textDark).text(value || 'Não informado', { width });
  return doc.y;
}

/** Cabeçalho da clínica alinhado à direita + nome do veterinário. */
export function drawClinicHeaderRight(
  doc: PdfDoc,
  opts: {
    margin: number;
    pageW: number;
    clinic: ClinicalPdfClinic | null | undefined;
    veterinarian?: VetStampPdfParty | null;
  },
): number {
  const { margin, pageW, clinic, veterinarian } = opts;
  let y = margin;
  const headerX = margin;

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(CLINICAL_PDF.textDark)
    .text(clinic?.name || 'Clínica veterinária', headerX, y, { width: pageW, align: 'right' });
  y = doc.y + 2;

  const clinicAddress = clinic ? formatClinicAddress(clinic) : '';
  if (clinicAddress) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(CLINICAL_PDF.textMuted)
      .text(clinicAddress, headerX, y, { width: pageW, align: 'right' });
    y = doc.y + 1;
  }
  if (clinic?.phone) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(CLINICAL_PDF.textMuted)
      .text(clinic.phone, headerX, y, { width: pageW, align: 'right' });
    y = doc.y + 1;
  }
  if (clinic?.email) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(CLINICAL_PDF.textMuted)
      .text(clinic.email, headerX, y, { width: pageW, align: 'right' });
    y = doc.y + 1;
  }
  if (veterinarian?.full_name) {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(CLINICAL_PDF.textDark)
      .text(veterinarian.full_name, headerX, y + 2, { width: pageW, align: 'right' });
    y = doc.y;
  }

  return y + 18;
}

/** Título central + linha divisória. */
export function drawCenteredDocumentTitle(
  doc: PdfDoc,
  title: string,
  margin: number,
  pageW: number,
  y: number,
): number {
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(CLINICAL_PDF.textDark)
    .text(title, margin, y, { width: pageW, align: 'center' });
  y = doc.y + 8;
  doc
    .moveTo(margin, y)
    .lineTo(doc.page.width - margin, y)
    .strokeColor(CLINICAL_PDF.border)
    .lineWidth(1)
    .stroke();
  return y + 14;
}

/** Bloco «Identificação do pet e responsável» em duas colunas. */
export function drawPartyIdentification(
  doc: PdfDoc,
  opts: {
    margin: number;
    pageW: number;
    y: number;
    pet: ClinicalPdfPet | null | undefined;
    guardian: ClinicalPdfGuardian | null | undefined;
    issuedAt?: string | null;
    expiresAt?: string | null;
  },
): number {
  const { margin, pageW, pet, guardian } = opts;
  let y = opts.y;

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(CLINICAL_PDF.textDark)
    .text('Identificação do pet e responsável', margin, y, {
      width: pageW * 0.55,
      continued: false,
    });

  const dateLabel = opts.issuedAt
    ? new Date(opts.issuedAt).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');
  const expiresLabel = opts.expiresAt ? new Date(opts.expiresAt).toLocaleDateString('pt-BR') : null;
  const datesBlock = expiresLabel
    ? `Emitida: ${dateLabel}  ·  Válida até: ${expiresLabel}`
    : `Emitida: ${dateLabel}`;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(CLINICAL_PDF.textDark)
    .text(datesBlock, margin, y, { width: pageW, align: 'right' });
  y = Math.max(doc.y, y + 14) + 6;

  const colGap = 24;
  const colW = (pageW - colGap) / 2;
  const leftX = margin;
  const rightX = margin + colW + colGap;
  let leftY = y;
  let rightY = y;

  leftY = drawLabelValue(doc, 'Pet', pet?.name || '—', leftX, leftY, colW) + 4;
  leftY = drawLabelValue(doc, 'Espécie', pet?.species || 'Não informado', leftX, leftY, colW) + 4;
  leftY = drawLabelValue(doc, 'Raça', pet?.breed || 'Não informado', leftX, leftY, colW) + 4;
  leftY = drawLabelValue(doc, 'Idade', formatAgeFromBirthDate(pet?.birth_date), leftX, leftY, colW) + 4;

  rightY = drawLabelValue(doc, 'Responsável', guardian?.full_name || '—', rightX, rightY, colW) + 4;
  rightY =
    drawLabelValue(
      doc,
      'Endereço',
      guardian ? formatGuardianAddress(guardian) : 'Não informado',
      rightX,
      rightY,
      colW,
    ) + 4;
  rightY = drawLabelValue(doc, 'Telefone', guardian?.phone || 'Não informado', rightX, rightY, colW) + 4;
  rightY = drawLabelValue(doc, 'CPF', formatTaxIdDisplay(guardian?.tax_id), rightX, rightY, colW) + 4;
  rightY =
    drawLabelValue(doc, 'RG', guardian?.id_doc_number?.trim() || 'Não informado', rightX, rightY, colW) + 4;

  return Math.max(leftY, rightY) + 16;
}

export async function drawClinicalStampBlock(
  doc: PdfDoc,
  veterinarian: VetStampPdfParty | null | undefined,
  opts: { margin: number; pageW: number; y: number },
): Promise<number> {
  const stampBuffers = await loadVetStampBuffers(veterinarian);
  const y = Math.max(opts.y + 24, Math.min(opts.y + 40, doc.page.height - 160));
  return drawVetStampBlock(doc, veterinarian, {
    margin: opts.margin,
    pageW: opts.pageW,
    y,
    signatureBuf: stampBuffers.signature,
    stampBuf: stampBuffers.stamp,
    showLineWhenEmpty: true,
    textDark: CLINICAL_PDF.textDark,
    textMuted: CLINICAL_PDF.textMuted,
    border: CLINICAL_PDF.border,
  });
}

/** Rodapé de validação PetMi Hub (QR + código + hash + disclaimers). */
export async function drawValidationFooter(
  doc: PdfDoc,
  validation: ClinicalPdfValidationMeta,
  opts: { margin: number; pageW: number; y: number },
): Promise<void> {
  const { margin, pageW } = opts;
  let y = opts.y;

  if (y > doc.page.height - 200) {
    doc.addPage();
    y = margin;
  } else {
    y += 28;
  }

  doc
    .moveTo(margin, y)
    .lineTo(doc.page.width - margin, y)
    .strokeColor('#cccccc')
    .lineWidth(0.5)
    .stroke();
  y += 12;

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(CLINICAL_PDF.textDark)
    .text('Validação PetMi Hub', margin, y);
  y = doc.y + 8;

  const qrSize = 72;
  let qrBuffer: Buffer | null = null;
  try {
    qrBuffer = await QRCode.toBuffer(validation.public_url, { type: 'png', margin: 1, width: qrSize });
  } catch {
    qrBuffer = null;
  }

  const metaX = margin + (qrBuffer ? qrSize + 14 : 0);
  const metaW = pageW - (qrBuffer ? qrSize + 14 : 0);

  if (qrBuffer) {
    doc.image(qrBuffer, margin, y, { width: qrSize, height: qrSize });
  }

  doc.font('Helvetica').fontSize(9).fillColor(CLINICAL_PDF.textMuted).text('Código', metaX, y);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(CLINICAL_PDF.textDark)
    .text(validation.validation_code, metaX, y + 12);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(CLINICAL_PDF.textMuted)
    .text(`Integridade: ${truncateHash(validation.content_hash)}`, metaX, y + 30, { width: metaW });
  const validity = validation.expires_at
    ? `Válida até ${new Date(validation.expires_at).toLocaleDateString('pt-BR')}`
    : `Emitida em ${new Date(validation.issued_at).toLocaleString('pt-BR')}`;
  doc.font('Helvetica').fontSize(8).fillColor(CLINICAL_PDF.textMuted).text(validity, metaX, y + 44, {
    width: metaW,
  });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(CLINICAL_PDF.textMuted)
    .text(validation.public_url, metaX, y + 58, { width: metaW });

  y = Math.max(y + (qrBuffer ? qrSize : 70), doc.y) + 12;
  doc.font('Helvetica').fontSize(7).fillColor(CLINICAL_PDF.textMuted);
  for (const line of validation.disclaimers) {
    doc.text(`• ${line}`, margin, y, { width: pageW });
    y = doc.y + 2;
  }
}
