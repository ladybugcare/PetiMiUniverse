import type { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BORDER = '#e5dcd6';

const exportBodySchema = z
  .object({
    clinic_id: z.string().uuid(),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(240).optional().nullable(),
    filename: z.string().max(120).optional().nullable(),
    headers: z.array(z.string().max(80)).min(1).max(20),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(800),
  })
  .strict();

function cellText(v: string | number | null | undefined): string {
  if (v == null) return '—';
  return String(v);
}

/** PDF tabular genérico para exportação de relatórios do Hub. */
export const postHubReportExportPdf = async (req: Request, res: Response) => {
  try {
    const parsed = exportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload inválido para PDF', details: parsed.error.flatten() });
    }
    const { title, subtitle, headers, rows } = parsed.data;
    const slug = (parsed.data.filename || title)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    const fileName = `petmi-${slug || 'relatorio'}-${new Date().toISOString().slice(0, 10)}.pdf`;

    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: headers.length > 6 ? 'landscape' : 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    doc.pipe(res);

    const margin = 40;
    const contentW = doc.page.width - margin * 2;
    let y = margin;

    doc.font('Helvetica-Bold').fontSize(16).fillColor(ORANGE).text('PetMi Hub', margin, y);
    y = doc.y + 6;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT_DARK).text(title, margin, y, { width: contentW });
    y = doc.y + 4;
    if (subtitle) {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(subtitle, margin, y, { width: contentW });
      y = doc.y + 8;
    } else {
      y += 8;
    }

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(TEXT_MUTED)
      .text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, y, { width: contentW });
    y = doc.y + 10;

    const colCount = headers.length;
    const colW = contentW / colCount;
    const rowH = 16;
    const drawHeader = () => {
      doc.rect(margin, y, contentW, rowH + 4).fill(BORDER);
      doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(8);
      headers.forEach((h, i) => {
        doc.text(h, margin + i * colW + 3, y + 4, { width: colW - 6, ellipsis: true });
      });
      y += rowH + 6;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_DARK);

    for (const row of rows) {
      if (y > doc.page.height - margin - rowH) {
        doc.addPage();
        y = margin;
        drawHeader();
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_DARK);
      }
      for (let i = 0; i < colCount; i += 1) {
        doc.text(cellText(row[i]), margin + i * colW + 3, y, {
          width: colW - 6,
          ellipsis: true,
          lineBreak: false,
        });
      }
      y += rowH;
      doc
        .moveTo(margin, y - 2)
        .lineTo(margin + contentW, y - 2)
        .strokeColor('#f0e8e3')
        .lineWidth(0.5)
        .stroke();
    }

    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(TEXT_MUTED).text('Sem dados para o período.', margin, y);
    }

    doc.end();
  } catch (e: unknown) {
    console.error('postHubReportExportPdf', e);
    if (!res.headersSent) {
      return res.status(500).json({ error: (e as Error)?.message || 'Erro ao gerar PDF' });
    }
  }
};
