import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import {
  PDF_MARGIN,
  PDF_MUTED,
  PDF_TEXT,
  PDF_BORDER,
  brlPdf,
  contentWidth,
  drawDataTableHeader,
  drawDefinitionRows,
  drawFineprint,
  drawNotesCard,
  drawPageShell,
  drawPublicDocumentHeader,
  drawSectionCard,
  drawTableDivider,
  drawTotalsCard,
  embedOnePdf,
  ensurePdfSpace,
  measureDefinitionRowsHeight,
  clientNotesTitlePdf,
  type PdfDoc,
} from './hubPublicDocumentPdf';

type ComandaItem = {
  id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  sort_order: number;
  pet_name?: string | null;
};

type GuardianEmbed = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
};

type ComandaPet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  size_tier: string;
};

type ClinicEmbed = { name: string | null; photo_url?: string | null };

export type ComandaPdfPayload = {
  id: string;
  status: string;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  opened_at: string;
  closed_at?: string | null;
  guardian: GuardianEmbed | null;
  clinic?: ClinicEmbed | ClinicEmbed[] | null;
  items: ComandaItem[];
  pets?: ComandaPet[];
  paid_total?: number;
  balance_due?: number;
  client_notes?: string | null;
};

function statusLabelPt(status: string): string {
  const m: Record<string, string> = {
    aberta: 'Aberta',
    fechada: 'Fechada',
    cancelada: 'Cancelada',
  };
  return m[status] ?? status;
}

function sizeTierLabelPt(tier: string): string {
  const m: Record<string, string> = {
    mini: 'Mini',
    pequeno: 'Pequeno',
    medio: 'Médio',
    grande: 'Grande',
    gigante: 'Gigante',
  };
  return tier ? m[tier] ?? tier : '—';
}

function drawPetsTable(doc: PdfDoc, x: number, y: number, width: number, pets: ComandaPet[]): number {
  const cols = [
    { label: 'Nome', w: 0.28 },
    { label: 'Espécie', w: 0.22 },
    { label: 'Raça', w: 0.28 },
    { label: 'Porte', w: 0.22 },
  ];
  let cy = y;
  let tx = x;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_MUTED);
  cols.forEach((col) => {
    const w = width * col.w;
    doc.text(col.label.toUpperCase(), tx, cy, { width: w });
    tx += w;
  });
  cy = doc.y + 8;
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_TEXT);
  pets.forEach((p) => {
    tx = x;
    const row = [p.name, p.species || '—', p.breed?.trim() || '—', sizeTierLabelPt(p.size_tier)];
    row.forEach((cell, j) => {
      const w = width * cols[j]!.w;
      doc.text(cell, tx, cy, { width: w });
      tx += w;
    });
    cy = doc.y + 6;
  });
  return cy;
}

function measurePetsTableHeight(pets: ComandaPet[]): number {
  return 22 + pets.length * 16 + 4;
}

function derivePetsFromItems(items: ComandaItem[]): ComandaPet[] {
  const byName = new Map<string, ComandaPet>();
  for (const it of items) {
    const name = it.pet_name?.trim();
    if (!name) continue;
    if (!byName.has(name)) {
      byName.set(name, { id: name, name, species: '—', breed: null, size_tier: '' });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function streamComandaPdf(res: Response, payload: ComandaPdfPayload): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="comanda-${payload.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  drawPageShell(doc);

  const clinic = embedOnePdf(payload.clinic);
  const clinicName = clinic?.name?.trim() || 'Clínica';
  const guardian = payload.guardian;
  const items = [...payload.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const pets = (payload.pets?.length ? payload.pets : derivePetsFromItems(items)).slice();

  const margin = PDF_MARGIN;
  const contentW = contentWidth(doc, margin);

  let y = await drawPublicDocumentHeader(doc, margin, margin, {
    eyebrow: 'Comanda',
    clinicName,
    tagline: 'Resumo de serviços e valores.',
    metaRows: [
      { label: 'Referência', value: payload.id.slice(0, 8).toUpperCase(), accent: true },
      { label: 'Aberta em', value: new Date(payload.opened_at).toLocaleString('pt-BR') },
      { label: 'Status', value: statusLabelPt(payload.status) },
    ],
    clinicLogoUrl: clinic?.photo_url?.trim() || null,
  });

  const colGap = 14;
  const colW = (contentW - colGap) / 2;
  const contactRows = guardian
    ? [
        { label: 'Nome', value: guardian.full_name },
        { label: 'Telefone', value: guardian.phone?.trim() || '—' },
        ...(guardian.tax_id ? [{ label: 'CPF', value: guardian.tax_id }] : []),
        ...(guardian.email ? [{ label: 'E-mail', value: guardian.email }] : []),
      ]
    : [];
  const contactBodyH = guardian ? measureDefinitionRowsHeight(contactRows) : 14;
  const petsBodyH = pets.length > 0 ? measurePetsTableHeight(pets) : 14;
  const cardsH = Math.max(contactBodyH, petsBodyH) + 36;

  y = ensurePdfSpace(doc, y, cardsH, margin);

  const contactCard = drawSectionCard(doc, margin, y, colW, 'Dados do contato', contactBodyH);
  if (guardian) {
    drawDefinitionRows(doc, contactCard.innerX, contactCard.innerY, colW - 32, contactRows);
  } else {
    doc.font('Helvetica').fontSize(10).fillColor(PDF_MUTED).text('—', contactCard.innerX, contactCard.innerY);
  }

  const petsX = margin + colW + colGap;
  const petsCard = drawSectionCard(doc, petsX, y, colW, 'Pets', petsBodyH);
  if (pets.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(PDF_MUTED).text('—', petsCard.innerX, petsCard.innerY);
  } else {
    drawPetsTable(doc, petsCard.innerX, petsCard.innerY, colW - 32, pets);
  }

  y = Math.max(contactCard.bottom, petsCard.bottom) + 16;

  const servicesRowH = 22;
  const servicesH = 42 + (items.length > 0 ? 24 + items.length * servicesRowH : 36);
  y = ensurePdfSpace(doc, y, servicesH, margin);

  doc.save();
  doc.roundedRect(margin, y, contentW, servicesH, 12).fill('#ffffff');
  doc.roundedRect(margin, y, contentW, servicesH, 12).strokeColor(PDF_BORDER).lineWidth(1).stroke();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(PDF_TEXT).text('Serviços e valores', margin + 16, y + 16);

  let tableY = y + 40;
  if (items.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(PDF_MUTED).text('Sem itens.', margin + 16, tableY);
  } else {
    const wDesc = contentW * 0.42;
    const wPet = contentW * 0.2;
    const wQty = 44;
    const wTotal = contentW - wDesc - wPet - wQty - 32;
    tableY = drawDataTableHeader(doc, margin + 8, tableY, contentW - 16, [
      { label: 'Serviço', width: wDesc },
      { label: 'Pet', width: wPet },
      { label: 'Qtd', width: wQty, align: 'right' },
      { label: 'Total linha', width: wTotal, align: 'right' },
    ]);

    items.forEach((it) => {
      tableY = ensurePdfSpace(doc, tableY, servicesRowH + 8, margin);
      const rowTop = tableY;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PDF_TEXT).text(it.description, margin + 18, rowTop, {
        width: wDesc - 12,
      });
      doc.font('Helvetica').fontSize(9).fillColor(PDF_TEXT).text(it.pet_name ?? '—', margin + 18 + wDesc, rowTop, {
        width: wPet - 8,
      });
      doc.text(String(it.quantity), margin + 18 + wDesc + wPet, rowTop, { width: wQty - 6, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9.5).text(brlPdf(it.line_total), margin + 18 + wDesc + wPet + wQty, rowTop, {
        width: wTotal - 8,
        align: 'right',
      });
      tableY = rowTop + servicesRowH;
      drawTableDivider(doc, margin + 8, tableY, contentW - 16);
      tableY += 4;
    });
  }

  y = y + servicesH + 8;

  if (payload.client_notes?.trim()) {
    y = drawNotesCard(doc, margin, y, contentW, clientNotesTitlePdf(clinicName), payload.client_notes.trim());
  }

  const paid = Number(payload.paid_total ?? 0);
  const balance = Number(payload.balance_due ?? Math.max(0, payload.total_amount - paid));
  const totalRows = [
    { label: 'Subtotal', value: brlPdf(payload.subtotal_amount) },
    ...(payload.discount_amount > 0
      ? [{ label: 'Desconto', value: `−${brlPdf(payload.discount_amount)}`, kind: 'discount' as const }]
      : []),
    { label: 'Total', value: brlPdf(payload.total_amount), kind: 'grand' as const },
    ...(paid > 0.009 ? [{ label: 'Pago', value: brlPdf(paid), kind: 'muted' as const }] : []),
    ...(balance > 0.009 ? [{ label: 'Pendente', value: brlPdf(balance), kind: 'warn' as const }] : []),
  ];
  y = drawTotalsCard(doc, margin, y, contentW, totalRows);

  y = drawFineprint(
    doc,
    margin,
    y,
    contentW,
    'Este documento é um resumo de serviços e valores. Em caso de dúvidas, entre em contato com a clínica.',
  );

  doc.end();
}
