import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { brlPdf, type PdfDoc } from './hubPublicDocumentPdf';
import type { ComandaPdfPayload } from './hubComandaPdf';
import type { HubCupomWidthMm } from './hubClinicSettingsController';

const MM_TO_PT = 72 / 25.4;

function embedClinic(clinic: ComandaPdfPayload['clinic']): { name: string | null; photo_url?: string | null } | null {
  if (!clinic) return null;
  return Array.isArray(clinic) ? clinic[0] ?? null : clinic;
}

function divider(doc: PdfDoc, x: number, y: number, w: number): number {
  doc
    .strokeColor('#999999')
    .lineWidth(0.5)
    .moveTo(x, y)
    .lineTo(x + w, y)
    .stroke();
  return y + 6;
}

function estimateHeight(payload: ComandaPdfPayload, widthMm: HubCupomWidthMm): number {
  const items = payload.items?.length ?? 0;
  const notesLines = payload.client_notes?.trim() ? Math.ceil(payload.client_notes.trim().length / (widthMm === 58 ? 28 : 40)) : 0;
  // Header + tutor + items + totals + footer + padding (folga para não cortar na bobina)
  return Math.max(360, 180 + items * 32 + notesLines * 12 + 140);
}

/**
 * Cupom térmico de venda (não fiscal) em PDF estreito 58mm ou 80mm.
 */
export function streamComandaCupomPdf(
  res: Response,
  payload: ComandaPdfPayload,
  widthMm: HubCupomWidthMm,
): void {
  const pageWidth = widthMm * MM_TO_PT;
  const pageHeight = estimateHeight(payload, widthMm);
  const margin = widthMm === 58 ? 6 : 8;
  const contentW = pageWidth - margin * 2;

  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margin,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="cupom-${payload.id.slice(0, 8)}-${widthMm}mm.pdf"`,
  );
  doc.pipe(res);

  const clinic = embedClinic(payload.clinic);
  const clinicName = clinic?.name?.trim() || 'Clínica';
  const items = [...payload.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const paid = Number(payload.paid_total ?? 0);
  const balance = Number(payload.balance_due ?? Math.max(0, payload.total_amount - paid));

  let y = margin;

  doc.font('Helvetica-Bold').fontSize(widthMm === 58 ? 9 : 10).fillColor('#000000');
  doc.text(clinicName, margin, y, { width: contentW, align: 'center' });
  y = doc.y + 2;

  doc.font('Helvetica').fontSize(7).fillColor('#333333');
  doc.text('CUPOM DE VENDA', margin, y, { width: contentW, align: 'center' });
  y = doc.y + 4;
  y = divider(doc, margin, y, contentW);

  doc.font('Helvetica').fontSize(7).fillColor('#000000');
  doc.text(`Ref: ${payload.id.slice(0, 8).toUpperCase()}`, margin, y, { width: contentW });
  y = doc.y + 1;
  doc.text(`Data: ${new Date(payload.opened_at).toLocaleString('pt-BR')}`, margin, y, {
    width: contentW,
  });
  y = doc.y + 4;
  y = divider(doc, margin, y, contentW);

  if (payload.guardian?.full_name) {
    doc.font('Helvetica-Bold').fontSize(7).text('Tutor', margin, y, { width: contentW });
    y = doc.y + 1;
    doc.font('Helvetica').fontSize(7).text(payload.guardian.full_name, margin, y, { width: contentW });
    y = doc.y + 1;
    if (payload.guardian.phone?.trim()) {
      doc.text(payload.guardian.phone.trim(), margin, y, { width: contentW });
      y = doc.y + 1;
    }
    y += 3;
    y = divider(doc, margin, y, contentW);
  }

  doc.font('Helvetica-Bold').fontSize(7).text('Itens', margin, y, { width: contentW });
  y = doc.y + 3;

  if (items.length === 0) {
    doc.font('Helvetica').fontSize(7).fillColor('#555555').text('Sem itens.', margin, y, {
      width: contentW,
    });
    y = doc.y + 4;
  } else {
    for (const it of items) {
      const desc = it.pet_name?.trim()
        ? `${it.description} (${it.pet_name.trim()})`
        : it.description;
      doc.font('Helvetica').fontSize(7).fillColor('#000000');
      doc.text(desc, margin, y, { width: contentW });
      y = doc.y + 1;
      const qtyLine = `${it.quantity} x ${brlPdf(it.unit_amount)}`;
      doc.font('Helvetica').fontSize(7);
      doc.text(qtyLine, margin, y, { width: contentW * 0.55, continued: false });
      const lineY = y;
      doc.text(brlPdf(it.line_total), margin, lineY, { width: contentW, align: 'right' });
      y = Math.max(doc.y, lineY + 9) + 2;
    }
  }

  y = divider(doc, margin, y + 2, contentW);

  const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Subtotal', value: brlPdf(payload.subtotal_amount) },
  ];
  if (payload.discount_amount > 0.009) {
    totalRows.push({ label: 'Desconto', value: `-${brlPdf(payload.discount_amount)}` });
  }
  totalRows.push({ label: 'TOTAL', value: brlPdf(payload.total_amount), bold: true });
  if (paid > 0.009) totalRows.push({ label: 'Pago', value: brlPdf(paid) });
  if (balance > 0.009) totalRows.push({ label: 'Pendente', value: brlPdf(balance) });

  for (const row of totalRows) {
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(row.bold ? 8 : 7).fillColor('#000000');
    doc.text(row.label, margin, y, { width: contentW * 0.55 });
    const rowY = y;
    doc.text(row.value, margin, rowY, { width: contentW, align: 'right' });
    y = Math.max(doc.y, rowY + 10);
  }

  if (payload.client_notes?.trim()) {
    y = divider(doc, margin, y + 2, contentW);
    doc.font('Helvetica-Bold').fontSize(7).text('Obs.', margin, y, { width: contentW });
    y = doc.y + 1;
    doc.font('Helvetica').fontSize(6.5).fillColor('#333333');
    doc.text(payload.client_notes.trim(), margin, y, { width: contentW });
    y = doc.y + 4;
  }

  y = divider(doc, margin, y + 4, contentW);
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
  doc.text('Documento não fiscal', margin, y, { width: contentW, align: 'center' });
  y = doc.y + 2;
  doc.font('Helvetica').fontSize(6).fillColor('#555555');
  doc.text('PetMi Hub', margin, y, { width: contentW, align: 'center' });

  doc.end();
}
