import type PDFDocument from 'pdfkit';
import { loadImageBufferFromUrl } from './hubPublicDocumentPdf';

type PdfDoc = InstanceType<typeof PDFDocument>;

export type VetStampPdfParty = {
  full_name?: string | null;
  crmv?: string | null;
  crmv_uf?: string | null;
  signature_image_url?: string | null;
  stamp_image_url?: string | null;
};

const TEXT_DARK = '#222222';
const TEXT_MUTED = '#666666';
const BORDER = '#333333';

const SIGNATURE_MAX_W = 160;
const SIGNATURE_MAX_H = 56;
const STAMP_MAX_W = 88;
const STAMP_MAX_H = 88;

export async function loadVetStampBuffers(vet: VetStampPdfParty | null | undefined): Promise<{
  signature: Buffer | null;
  stamp: Buffer | null;
}> {
  const signatureUrl = vet?.signature_image_url?.trim() || '';
  const stampUrl = vet?.stamp_image_url?.trim() || '';
  const [signature, stamp] = await Promise.all([
    signatureUrl ? loadImageBufferFromUrl(signatureUrl) : Promise.resolve(null),
    stampUrl ? loadImageBufferFromUrl(stampUrl) : Promise.resolve(null),
  ]);
  return { signature, stamp };
}

/**
 * Desenha bloco de assinatura/carimbo + nome/CRMV.
 * Retorna o Y final (abaixo do texto).
 */
export function drawVetStampBlock(
  doc: PdfDoc,
  vet: VetStampPdfParty | null | undefined,
  opts: {
    margin: number;
    pageW: number;
    y: number;
    signatureBuf?: Buffer | null;
    stampBuf?: Buffer | null;
    showLineWhenEmpty?: boolean;
    textDark?: string;
    textMuted?: string;
    border?: string;
  },
): number {
  const textDark = opts.textDark ?? TEXT_DARK;
  const textMuted = opts.textMuted ?? TEXT_MUTED;
  const border = opts.border ?? BORDER;
  const showLine = opts.showLineWhenEmpty !== false;
  const signatureBuf = opts.signatureBuf ?? null;
  const stampBuf = opts.stampBuf ?? null;

  let y = opts.y;
  const hasImages = Boolean(signatureBuf || stampBuf);

  if (hasImages) {
    const rowH = Math.max(
      signatureBuf ? SIGNATURE_MAX_H : 0,
      stampBuf ? STAMP_MAX_H : 0,
      40,
    );
    if (y + rowH + 36 > doc.page.height - opts.margin) {
      doc.addPage();
      y = opts.margin;
    }

    const centerX = opts.margin + opts.pageW / 2;
    let cursorX = centerX;
    const totalW =
      (signatureBuf ? SIGNATURE_MAX_W : 0) +
      (signatureBuf && stampBuf ? 16 : 0) +
      (stampBuf ? STAMP_MAX_W : 0);
    cursorX = centerX - totalW / 2;

    if (signatureBuf) {
      doc.image(signatureBuf, cursorX, y, {
        fit: [SIGNATURE_MAX_W, SIGNATURE_MAX_H],
        align: 'center',
        valign: 'bottom',
      });
      cursorX += SIGNATURE_MAX_W + (stampBuf ? 16 : 0);
    }
    if (stampBuf) {
      doc.image(stampBuf, cursorX, y, {
        fit: [STAMP_MAX_W, STAMP_MAX_H],
        align: 'center',
        valign: 'center',
      });
    }
    y += rowH + 8;
  } else if (showLine) {
    const signY = Math.max(y + 24, Math.min(y + 40, doc.page.height - 140));
    if (signY + 40 > doc.page.height - opts.margin) {
      doc.addPage();
      y = opts.margin + 24;
    } else {
      y = signY;
    }
    doc
      .moveTo(opts.margin + 140, y)
      .lineTo(doc.page.width - opts.margin - 140, y)
      .strokeColor(border)
      .lineWidth(0.8)
      .stroke();
    y += 8;
  } else {
    y += 12;
  }

  const name = vet?.full_name?.trim() || 'Veterinário responsável';
  doc.font('Helvetica-Bold').fontSize(10).fillColor(textDark).text(name, opts.margin, y, {
    width: opts.pageW,
    align: 'center',
  });
  const crmv = [vet?.crmv ? `CRMV ${vet.crmv}` : null, vet?.crmv_uf || null].filter(Boolean).join(' / ');
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(textMuted)
    .text(crmv || 'CRMV não informado', opts.margin, doc.y + 2, { width: opts.pageW, align: 'center' });

  return doc.y;
}
