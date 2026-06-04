import type { Response } from 'express';
import PDFDocument from 'pdfkit';

type PdfDoc = InstanceType<typeof PDFDocument>;

type PrescriptionItem = {
  medication_name: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  order_index?: number | null;
};

type PrescriptionFull = {
  id: string;
  clinic_id: string;
  prescribed_at?: string | null;
  notes?: string | null;
  items?: PrescriptionItem[];
  clinic?: { name?: string | null; phone?: string | null; email?: string | null } | { name?: string | null; phone?: string | null; email?: string | null }[] | null;
  pet?: { name?: string | null; species?: string | null; breed?: string | null } | { name?: string | null; species?: string | null; breed?: string | null }[] | null;
  guardian?: { full_name?: string | null; phone?: string | null } | { full_name?: string | null; phone?: string | null }[] | null;
  staff?: { full_name?: string | null; crmv?: string | null; crmv_uf?: string | null } | { full_name?: string | null; crmv?: string | null; crmv_uf?: string | null }[] | null;
};

const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BORDER = '#e5dcd6';
const BEIGE = '#faf3ee';

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function drawField(doc: PdfDoc, label: string, value: string, x: number, y: number, width: number): number {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text(label, x, y, { width });
  doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(value || '—', x, doc.y + 2, { width });
  return doc.y;
}

export function streamPrescriptionPdf(res: Response, prescription: PrescriptionFull): void {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receita-${prescription.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  const clinic = embedOne(prescription.clinic);
  const pet = embedOne(prescription.pet);
  const guardian = embedOne(prescription.guardian);
  const staff = embedOne(prescription.staff);
  const items = [...(prescription.items ?? [])].sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
  const margin = 40;
  const pageW = doc.page.width - margin * 2;

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
  drawField(
    doc,
    'Data',
    prescription.prescribed_at ? new Date(prescription.prescribed_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
    margin + 14,
    fy,
    colW,
  );
  drawField(doc, 'Telefone tutor', guardian?.phone || '—', margin + 14 + colW + 12, fy, colW);
  y += 112;

  doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT_DARK).text('Medicamentos e orientações', margin, y);
  y = doc.y + 10;
  for (const [idx, item] of items.entries()) {
    if (y > doc.page.height - 150) {
      doc.addPage();
      y = margin;
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(`${idx + 1}. ${item.medication_name}`, margin, y);
    y = doc.y + 4;
    const parts = [
      item.dosage ? `Dose: ${item.dosage}` : null,
      item.frequency ? `Frequência: ${item.frequency}` : null,
      item.duration ? `Duração: ${item.duration}` : null,
    ].filter(Boolean);
    if (parts.length) {
      doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(parts.join(' · '), margin + 14, y, { width: pageW - 14 });
      y = doc.y + 3;
    }
    if (item.instructions) {
      doc.font('Helvetica').fontSize(10).fillColor(TEXT_MUTED).text(item.instructions, margin + 14, y, { width: pageW - 14 });
      y = doc.y + 8;
    } else {
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

  const signY = Math.max(y + 36, doc.page.height - 150);
  doc.moveTo(margin + 120, signY,).lineTo(doc.page.width - margin - 120, signY).strokeColor(BORDER).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text(staff?.full_name || 'Veterinário responsável', margin, signY + 8, { width: pageW, align: 'center' });
  const crmv = [staff?.crmv ? `CRMV ${staff.crmv}` : null, staff?.crmv_uf || null].filter(Boolean).join(' / ');
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(crmv || 'CRMV não informado', margin, doc.y + 2, { width: pageW, align: 'center' });

  doc.end();
}
