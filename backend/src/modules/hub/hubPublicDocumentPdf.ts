import type PDFDocument from 'pdfkit';

export type PdfDoc = InstanceType<typeof PDFDocument>;

export const PDF_MARGIN = 36;
export const PDF_BRAND = '#f0642f';
export const PDF_TEXT = '#4a3b3a';
export const PDF_MUTED = '#8e6e67';
export const PDF_BEIGE = '#faf3ee';
export const PDF_BORDER = '#e5dcd6';
export const PDF_SHELL = '#faf7f4';
export const PDF_WHITE = '#ffffff';
export const PDF_GREEN = '#2e7d32';
export const PDF_WARN = '#b45309';
export const PDF_LOGO_TINT = '#fde8df';

export function brlPdf(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function clientNotesTitlePdf(clinicName: string | null | undefined): string {
  const name = clinicName?.trim() || 'A clínica';
  return `${name} adicionou a observação abaixo`;
}

export function embedOnePdf<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

export async function loadImageBufferFromUrl(url: string): Promise<Buffer | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(trimmed);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function drawPageShell(doc: PdfDoc): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_SHELL);
  doc.restore();
}

export function contentWidth(doc: PdfDoc, margin = PDF_MARGIN): number {
  return doc.page.width - margin * 2;
}

export function ensurePdfSpace(doc: PdfDoc, y: number, needed: number, margin = PDF_MARGIN): number {
  const bottom = doc.page.height - margin - 32;
  if (y + needed <= bottom) return y;
  doc.addPage();
  drawPageShell(doc);
  return margin + 4;
}

export type PublicDocMetaRow = {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
};

export type PublicDocHeaderConfig = {
  eyebrow: string;
  clinicName: string;
  tagline: string;
  metaRows: PublicDocMetaRow[];
  clinicLogoUrl?: string | null;
};

export async function drawPublicDocumentHeader(
  doc: PdfDoc,
  margin: number,
  y: number,
  config: PublicDocHeaderConfig,
): Promise<number> {
  const contentW = contentWidth(doc, margin);
  const metaW = 220;
  const mainW = contentW - metaW - 14;
  const logoSize = 52;
  const headerTop = y;

  const logoBuf = config.clinicLogoUrl ? await loadImageBufferFromUrl(config.clinicLogoUrl) : null;
  doc.save();
  doc.roundedRect(margin, headerTop, logoSize, logoSize, logoSize / 2).fill(PDF_WHITE);
  doc.roundedRect(margin, headerTop, logoSize, logoSize, logoSize / 2).strokeColor(PDF_BORDER).lineWidth(1).stroke();
  if (logoBuf) {
    try {
      doc.image(logoBuf, margin, headerTop, { width: logoSize, height: logoSize, fit: [logoSize, logoSize] });
    } catch {
      doc.roundedRect(margin, headerTop, logoSize, logoSize, logoSize / 2).fill(PDF_LOGO_TINT);
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(PDF_BRAND)
        .text(config.clinicName.charAt(0).toUpperCase(), margin, headerTop + 14, { width: logoSize, align: 'center' });
    }
  } else {
    doc.roundedRect(margin, headerTop, logoSize, logoSize, logoSize / 2).fill(PDF_LOGO_TINT);
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(PDF_BRAND)
      .text(config.clinicName.charAt(0).toUpperCase(), margin, headerTop + 14, { width: logoSize, align: 'center' });
  }
  doc.restore();

  const textX = margin + logoSize + 14;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF_MUTED).text(config.eyebrow.toUpperCase(), textX, headerTop + 2, {
    width: mainW - logoSize - 14,
    characterSpacing: 0.6,
  });
  doc.font('Helvetica-Bold').fontSize(24).fillColor(PDF_BRAND).text(config.clinicName, textX, doc.y + 4, {
    width: mainW - logoSize - 14,
    lineGap: 1,
  });
  doc.font('Helvetica').fontSize(10.5).fillColor(PDF_MUTED).text(config.tagline, textX, doc.y + 6, {
    width: mainW - logoSize - 14,
    lineGap: 2,
  });

  const metaX = margin + contentW - metaW;
  const metaPad = 14;
  let metaY = headerTop;
  const metaInnerH = Math.max(88, 18 + config.metaRows.length * 34);
  doc.save();
  doc.roundedRect(metaX, metaY, metaW, metaInnerH, 12).fill(PDF_BEIGE);
  doc.roundedRect(metaX, metaY, metaW, metaInnerH, 12).strokeColor(PDF_BORDER).lineWidth(1).stroke();
  doc.restore();

  metaY += metaPad;
  config.metaRows.forEach((row, idx) => {
    if (idx > 0) metaY += 6;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_MUTED).text(row.label.toUpperCase(), metaX + metaPad, metaY, {
      width: metaW - metaPad * 2,
      characterSpacing: 0.4,
    });
    metaY = doc.y + 2;
    const valueSize = row.accent ? 14 : 10.5;
    const valueColor = row.warn ? PDF_WARN : row.accent ? PDF_BRAND : PDF_TEXT;
    doc.font(row.accent ? 'Helvetica-Bold' : 'Helvetica-Bold').fontSize(valueSize).fillColor(valueColor);
    doc.text(row.value, metaX + metaPad, metaY, { width: metaW - metaPad * 2 });
    metaY = doc.y + 2;
  });

  return Math.max(doc.y, headerTop + metaInnerH) + 22;
}

export function drawSectionCard(
  doc: PdfDoc,
  margin: number,
  y: number,
  width: number,
  title: string,
  bodyHeight: number,
): { innerX: number; innerY: number; bottom: number } {
  const pad = 16;
  const cardH = pad + 18 + bodyHeight + pad;
  doc.save();
  doc.roundedRect(margin, y, width, cardH, 12).fill(PDF_WHITE);
  doc.roundedRect(margin, y, width, cardH, 12).strokeColor(PDF_BORDER).lineWidth(1).stroke();
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(PDF_TEXT).text(title, margin + pad, y + pad, { width: width - pad * 2 });
  const innerY = doc.y + 10;
  return { innerX: margin + pad, innerY, bottom: y + cardH };
}

export function drawDefinitionRows(
  doc: PdfDoc,
  x: number,
  y: number,
  width: number,
  rows: { label: string; value: string }[],
): number {
  const labelW = 78;
  let cy = y;
  rows.forEach((row) => {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PDF_MUTED).text(row.label, x, cy, { width: labelW });
    doc.font('Helvetica').fontSize(10).fillColor(PDF_TEXT).text(row.value || '—', x + labelW + 8, cy, {
      width: width - labelW - 8,
    });
    cy = Math.max(doc.y, cy + 14) + 4;
  });
  return cy;
}

export function measureDefinitionRowsHeight(rows: { label: string; value: string }[]): number {
  return rows.length * 18 + 4;
}

export function drawDataTableHeader(
  doc: PdfDoc,
  margin: number,
  y: number,
  contentW: number,
  columns: { label: string; width: number; align?: 'left' | 'right' }[],
): number {
  const rowH = 24;
  doc.save();
  doc.rect(margin, y, contentW, rowH).fill(PDF_BEIGE);
  doc.restore();
  let hx = margin + 10;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_MUTED);
  columns.forEach((col) => {
    doc.text(col.label, hx, y + 7, { width: col.width - 8, align: col.align ?? 'left' });
    hx += col.width;
  });
  return y + rowH;
}

export function drawTableDivider(doc: PdfDoc, margin: number, y: number, contentW: number): void {
  doc.moveTo(margin + 8, y).lineTo(margin + contentW - 8, y).strokeColor('#f0ebe6').lineWidth(0.5).stroke();
}

export type TotalsRow = {
  label: string;
  value: string;
  kind?: 'default' | 'discount' | 'grand' | 'muted' | 'warn';
};

export function drawTotalsCard(doc: PdfDoc, margin: number, y: number, contentW: number, rows: TotalsRow[]): number {
  const boxW = 300;
  const boxX = margin + contentW - boxW;
  const rowH = 22;
  const grandExtra = rows.some((r) => r.kind === 'grand') ? 10 : 0;
  const boxH = 16 + rows.length * rowH + grandExtra + 12;

  y = ensurePdfSpace(doc, y, boxH + 8, margin);

  doc.save();
  doc.roundedRect(boxX, y, boxW, boxH, 12).fill(PDF_WHITE);
  doc.roundedRect(boxX, y, boxW, boxH, 12).strokeColor(PDF_BORDER).lineWidth(1).stroke();
  doc.restore();

  let cy = y + 14;
  let grandDividerDrawn = false;
  rows.forEach((row) => {
    if (row.kind === 'grand' && !grandDividerDrawn) {
      cy += 4;
      doc.moveTo(boxX + 14, cy).lineTo(boxX + boxW - 14, cy).strokeColor(PDF_BORDER).lineWidth(0.75).stroke();
      cy += 10;
      grandDividerDrawn = true;
    }

    const color =
      row.kind === 'discount'
        ? PDF_GREEN
        : row.kind === 'grand'
          ? PDF_BRAND
          : row.kind === 'warn'
            ? PDF_WARN
            : row.kind === 'muted'
              ? PDF_MUTED
              : PDF_TEXT;
    const labelSize = row.kind === 'grand' ? 12 : 10;
    const valueSize = row.kind === 'grand' ? 18 : 10;
    doc.font(row.kind === 'grand' ? 'Helvetica-Bold' : 'Helvetica').fontSize(labelSize).fillColor(color);
    doc.text(row.label, boxX + 14, cy, { width: boxW / 2 - 20 });
    doc.font(row.kind === 'grand' ? 'Helvetica-Bold' : 'Helvetica-Bold').fontSize(valueSize).fillColor(color);
    doc.text(row.value, boxX + boxW / 2, cy, { width: boxW / 2 - 14, align: 'right' });
    cy += row.kind === 'grand' ? 26 : rowH - 4;
  });

  return y + boxH + 16;
}

export function drawNotesCard(doc: PdfDoc, margin: number, y: number, contentW: number, title: string, body: string): number {
  const pad = 16;
  doc.font('Helvetica').fontSize(10.5).fillColor(PDF_TEXT);
  const bodyH = doc.heightOfString(body, { width: contentW - pad * 2 });
  const cardH = pad + 18 + bodyH + pad;
  y = ensurePdfSpace(doc, y, cardH + 8, margin);

  doc.save();
  doc.roundedRect(margin, y, contentW, cardH, 12).fill(PDF_WHITE);
  doc.roundedRect(margin, y, contentW, cardH, 12).strokeColor(PDF_BORDER).lineWidth(1).stroke();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(PDF_TEXT).text(title, margin + pad, y + pad, {
    width: contentW - pad * 2,
  });
  doc.font('Helvetica').fontSize(10.5).fillColor(PDF_TEXT).text(body, margin + pad, doc.y + 8, {
    width: contentW - pad * 2,
    lineGap: 3,
  });
  return y + cardH + 14;
}

export function drawFineprint(doc: PdfDoc, margin: number, y: number, contentW: number, text: string): number {
  y = ensurePdfSpace(doc, y, 40, margin);
  doc.font('Helvetica').fontSize(9).fillColor(PDF_MUTED).text(text, margin, y, {
    width: Math.min(contentW, 420),
    lineGap: 3,
  });
  return doc.y + 8;
}
