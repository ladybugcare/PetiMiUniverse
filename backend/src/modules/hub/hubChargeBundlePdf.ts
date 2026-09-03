import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import {
  PDF_MARGIN,
  PDF_MUTED,
  PDF_TEXT,
  brlPdf,
  contentWidth,
  drawDataTableHeader,
  drawFineprint,
  drawPageShell,
  drawPublicDocumentHeader,
  drawSectionCard,
  drawTableDivider,
  drawTotalsCard,
  embedOnePdf,
  ensurePdfSpace,
  type PdfDoc,
} from './hubPublicDocumentPdf';

type BundlePdfItem = {
  title: string;
  pet_names: string[];
  due_date: string | null;
  balance_amount: number;
};

export type ChargeBundlePdfPayload = {
  id: string;
  due_date: string | null;
  total_amount: number;
  balance_due: number;
  guardian: { full_name: string; phone?: string | null; email?: string | null } | null;
  clinic?: { name: string | null; photo_url?: string | null } | null;
  items: BundlePdfItem[];
  notes?: string | null;
};

function formatDueDatePt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function drawItemsTable(doc: PdfDoc, x: number, y: number, width: number, items: BundlePdfItem[]): number {
  const wDesc = width * 0.46;
  const wPet = width * 0.22;
  const wDue = width * 0.16;
  const wVal = width - wDesc - wPet - wDue;
  const cols = [
    { label: 'Descrição', width: wDesc },
    { label: 'Pet(s)', width: wPet },
    { label: 'Vencimento', width: wDue },
    { label: 'Valor', width: wVal, align: 'right' as const },
  ];
  let cy = drawDataTableHeader(doc, x, y, width, cols);
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_TEXT);
  for (const it of items) {
    const pets = it.pet_names.length ? it.pet_names.join(', ') : '—';
    const row = [it.title, pets, formatDueDatePt(it.due_date), brlPdf(it.balance_amount)];
    let tx = x + 10;
    row.forEach((cell, j) => {
      const colW = cols[j]!.width;
      doc.text(cell, tx, cy + 4, { width: colW - 8, align: cols[j]!.align ?? 'left' });
      tx += colW;
    });
    cy += 22;
  }
  return cy;
}

export async function streamChargeBundlePdf(res: Response, payload: ChargeBundlePdfPayload): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="cobranca-lote-${payload.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  drawPageShell(doc);

  const clinic = embedOnePdf(payload.clinic);
  const clinicName = clinic?.name?.trim() || 'Clínica';
  const margin = PDF_MARGIN;
  const contentW = contentWidth(doc, margin);
  const items = payload.items.slice();

  let y = await drawPublicDocumentHeader(doc, margin, margin, {
    eyebrow: 'Cobrança agrupada',
    clinicName,
    tagline: 'Resumo consolidado das cobranças selecionadas.',
    metaRows: [
      { label: 'Referência', value: payload.id.slice(0, 8).toUpperCase(), accent: true },
      { label: 'Vencimento', value: formatDueDatePt(payload.due_date) },
      { label: 'Itens', value: String(items.length) },
    ],
    clinicLogoUrl: clinic?.photo_url?.trim() || null,
  });

  const guardian = payload.guardian;
  if (guardian) {
    const card = drawSectionCard(doc, margin, y, contentW, 'Tutor', 48);
    doc.font('Helvetica').fontSize(10).fillColor(PDF_TEXT);
    doc.text(guardian.full_name, card.innerX, card.innerY);
    if (guardian.phone?.trim()) doc.text(`Telefone: ${guardian.phone.trim()}`, card.innerX, doc.y + 4);
    if (guardian.email?.trim()) doc.text(`E-mail: ${guardian.email.trim()}`, card.innerX, doc.y + 4);
    y = card.bottom + 16;
  }

  y = ensurePdfSpace(doc, y, 40 + items.length * 18, margin);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_TEXT).text('Itens do lote', margin, y);
  y = doc.y + 10;
  y = drawItemsTable(doc, margin, y, contentW, items);
  y += 8;
  drawTableDivider(doc, margin, y, contentW);
  y += 12;

  const totals = [
    { label: 'Total do lote', value: brlPdf(payload.total_amount) },
    { label: 'Saldo em aberto', value: brlPdf(payload.balance_due), accent: payload.balance_due > 0.009 },
  ];
  y = drawTotalsCard(doc, margin, y, contentW, totals);

  if (payload.notes?.trim()) {
    y += 12;
    y = ensurePdfSpace(doc, y, 60, margin);
    const notesCard = drawSectionCard(doc, margin, y, contentW, 'Observações', 40);
    doc.font('Helvetica').fontSize(10).fillColor(PDF_TEXT).text(payload.notes.trim(), notesCard.innerX, notesCard.innerY, {
      width: contentW - 32,
    });
    y = notesCard.bottom;
  }

  y += 16;
  drawFineprint(
    doc,
    margin,
    y,
    contentW,
    'Este documento consolida cobranças em aberto. Pagamentos parciais podem ser registrados separadamente pela clínica.',
  );

  doc.end();
}
