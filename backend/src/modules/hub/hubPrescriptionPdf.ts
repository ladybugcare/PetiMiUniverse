import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
  formatAgeFromBirthDate,
  formatClinicAddress,
  formatGuardianAddress,
  formatMedicationInstructions,
  formatMedicationQuantityLine,
  formatTaxIdDisplay,
  type PrescriptionSnapshotClinic,
  type PrescriptionSnapshotGuardian,
  type PrescriptionSnapshotMedication,
  type PrescriptionSnapshotPet,
} from './prescriptionValidation';

type PdfDoc = InstanceType<typeof PDFDocument>;

type PrescriptionItem = PrescriptionSnapshotMedication & {
  dosage?: string | null;
  frequency?: string | null;
  order_index?: number | null;
};

type PrescriptionFull = {
  id: string;
  clinic_id: string;
  prescribed_at?: string | null;
  expires_at?: string | null;
  notes?: string | null;
  items?: PrescriptionItem[];
  clinic?: PrescriptionSnapshotClinic | PrescriptionSnapshotClinic[] | null;
  pet?: PrescriptionSnapshotPet | PrescriptionSnapshotPet[] | null;
  guardian?: PrescriptionSnapshotGuardian | PrescriptionSnapshotGuardian[] | null;
  staff?:
    | { full_name?: string | null; crmv?: string | null; crmv_uf?: string | null }
    | { full_name?: string | null; crmv?: string | null; crmv_uf?: string | null }[]
    | null;
};

export type PrescriptionValidationMeta = {
  validation_code: string;
  public_url: string;
  content_hash: string;
  issued_at: string;
  expires_at?: string | null;
  disclaimers: string[];
};

const TEXT_DARK = '#222222';
const TEXT_MUTED = '#666666';
const BORDER = '#333333';
const DOT = '#aaaaaa';

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function truncateHash(hash: string, edge = 8): string {
  if (hash.length <= edge * 2 + 1) return hash;
  return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}

function drawLabelValue(doc: PdfDoc, label: string, value: string, x: number, y: number, width: number): number {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text(`${label}: `, x, y, {
    width,
    continued: true,
  });
  doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(value || 'Não informado', { width });
  return doc.y;
}

function drawDottedMedicationLine(
  doc: PdfDoc,
  name: string,
  qty: string,
  x: number,
  y: number,
  width: number,
): number {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK);
  const nameW = doc.widthOfString(name);
  doc.font('Helvetica').fontSize(11);
  const qtyW = qty ? doc.widthOfString(qty) : 0;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(name, x, y, { lineBreak: false });

  if (qty) {
    const gapStart = x + nameW + 8;
    const gapEnd = x + width - qtyW - 4;
    if (gapEnd > gapStart + 12) {
      let dx = gapStart;
      doc.font('Helvetica').fontSize(10).fillColor(DOT);
      while (dx < gapEnd) {
        doc.text('.', dx, y, { lineBreak: false });
        dx += 3.5;
      }
    }
    doc.font('Helvetica').fontSize(11).fillColor(TEXT_DARK).text(qty, x + width - qtyW, y, { lineBreak: false });
  }
  return y + 15;
}

function groupItemsByRoute(items: PrescriptionItem[]): Array<{ route: string | null; items: PrescriptionItem[] }> {
  const order: string[] = [];
  const map = new Map<string, PrescriptionItem[]>();
  for (const it of items) {
    const key = (it.use_route ?? '').trim() || '__none__';
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(it);
  }
  return order.map((key) => ({
    route: key === '__none__' ? null : key,
    items: map.get(key)!,
  }));
}

function drawPrescriptionBody(doc: PdfDoc, prescription: PrescriptionFull, margin: number, pageW: number): number {
  const clinic = embedOne(prescription.clinic);
  const pet = embedOne(prescription.pet);
  const guardian = embedOne(prescription.guardian);
  const staff = embedOne(prescription.staff);
  const items = [...(prescription.items ?? [])].sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));

  let y = margin;

  // Cabeçalho da clínica (alinhado à direita, como no exemplo)
  const headerX = margin;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text(clinic?.name || 'Clínica veterinária', headerX, y, {
    width: pageW,
    align: 'right',
  });
  y = doc.y + 2;
  const clinicAddress = clinic ? formatClinicAddress(clinic) : '';
  if (clinicAddress) {
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(clinicAddress, headerX, y, {
      width: pageW,
      align: 'right',
    });
    y = doc.y + 1;
  }
  if (clinic?.phone) {
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(clinic.phone, headerX, y, {
      width: pageW,
      align: 'right',
    });
    y = doc.y + 1;
  }
  if (clinic?.email) {
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(clinic.email, headerX, y, {
      width: pageW,
      align: 'right',
    });
    y = doc.y + 1;
  }
  if (staff?.full_name) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text(staff.full_name, headerX, y + 2, {
      width: pageW,
      align: 'right',
    });
    y = doc.y;
  }

  y += 18;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(TEXT_DARK).text('Receituário', margin, y, {
    width: pageW,
    align: 'center',
  });
  y = doc.y + 8;
  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).strokeColor(BORDER).lineWidth(1).stroke();
  y += 14;

  const dateLabel = prescription.prescribed_at
    ? new Date(prescription.prescribed_at).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');
  const expiresLabel = prescription.expires_at
    ? new Date(prescription.expires_at).toLocaleDateString('pt-BR')
    : null;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text('Identificação do pet e responsável', margin, y, {
    width: pageW * 0.55,
    continued: false,
  });
  const datesBlock = expiresLabel ? `Emitida: ${dateLabel}  ·  Válida até: ${expiresLabel}` : `Emitida: ${dateLabel}`;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK).text(datesBlock, margin, y, {
    width: pageW,
    align: 'right',
  });
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
    drawLabelValue(doc, 'Endereço', guardian ? formatGuardianAddress(guardian) : 'Não informado', rightX, rightY, colW) +
    4;
  rightY = drawLabelValue(doc, 'Telefone', guardian?.phone || 'Não informado', rightX, rightY, colW) + 4;
  rightY = drawLabelValue(doc, 'CPF', formatTaxIdDisplay(guardian?.tax_id), rightX, rightY, colW) + 4;
  rightY = drawLabelValue(doc, 'RG', guardian?.id_doc_number?.trim() || 'Não informado', rightX, rightY, colW) + 4;

  y = Math.max(leftY, rightY) + 16;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('PRESCRIÇÃO', margin, y);
  y = doc.y + 10;

  const groups = groupItemsByRoute(items);
  for (const group of groups) {
    if (y > doc.page.height - 160) {
      doc.addPage();
      y = margin;
    }
    if (group.route) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(group.route, margin, y);
      y = doc.y + 8;
    }
    for (const item of group.items) {
      if (y > doc.page.height - 140) {
        doc.addPage();
        y = margin;
      }
      const qty = formatMedicationQuantityLine(item);
      y = drawDottedMedicationLine(doc, item.medication_name, qty, margin, y, pageW);
      const instructions = formatMedicationInstructions(item);
      if (instructions) {
        doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(instructions, margin, y, {
          width: pageW,
        });
        y = doc.y + 10;
      } else {
        y += 8;
      }
    }
    y += 4;
  }

  if (prescription.notes?.trim()) {
    y += 6;
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = margin;
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text('Observações', margin, y);
    y = doc.y + 4;
    doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(prescription.notes.trim(), margin, y, { width: pageW });
    y = doc.y + 12;
  }

  const signY = Math.max(y + 40, doc.page.height - 140);
  doc.moveTo(margin + 140, signY).lineTo(doc.page.width - margin - 140, signY).strokeColor(BORDER).lineWidth(0.8).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text(staff?.full_name || 'Veterinário responsável', margin, signY + 8, { width: pageW, align: 'center' });
  const crmv = [staff?.crmv ? `CRMV ${staff.crmv}` : null, staff?.crmv_uf || null].filter(Boolean).join(' / ');
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(TEXT_MUTED)
    .text(crmv || 'CRMV não informado', margin, doc.y + 2, { width: pageW, align: 'center' });

  return doc.y;
}

export function streamPrescriptionPdf(res: Response, prescription: PrescriptionFull): void {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receita-${prescription.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);
  drawPrescriptionBody(doc, prescription, 48, doc.page.width - 96);
  doc.end();
}

export async function streamValidatablePrescriptionPdf(
  res: Response,
  prescription: PrescriptionFull,
  validation: PrescriptionValidationMeta,
): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receita-${validation.validation_code}.pdf"`);
  doc.pipe(res);

  const margin = 48;
  const pageW = doc.page.width - margin * 2;
  let y = drawPrescriptionBody(doc, prescription, margin, pageW);

  if (y > doc.page.height - 200) {
    doc.addPage();
    y = margin;
  } else {
    y += 28;
  }

  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
  y += 12;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text('Validação PetMi Hub', margin, y);
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

  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text('Código', metaX, y);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(validation.validation_code, metaX, y + 12);
  doc.font('Helvetica').fontSize(8).fillColor(TEXT_MUTED).text(`Integridade: ${truncateHash(validation.content_hash)}`, metaX, y + 30, {
    width: metaW,
  });
  const validity = validation.expires_at
    ? `Válida até ${new Date(validation.expires_at).toLocaleDateString('pt-BR')}`
    : `Emitida em ${new Date(validation.issued_at).toLocaleString('pt-BR')}`;
  doc.font('Helvetica').fontSize(8).fillColor(TEXT_MUTED).text(validity, metaX, y + 44, { width: metaW });
  doc.font('Helvetica').fontSize(7).fillColor(TEXT_MUTED).text(validation.public_url, metaX, y + 58, { width: metaW });

  y = Math.max(y + (qrBuffer ? qrSize : 70), doc.y) + 12;
  doc.font('Helvetica').fontSize(7).fillColor(TEXT_MUTED);
  for (const line of validation.disclaimers) {
    doc.text(`• ${line}`, margin, y, { width: pageW });
    y = doc.y + 2;
  }

  doc.end();
}
