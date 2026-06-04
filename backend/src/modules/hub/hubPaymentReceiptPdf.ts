import type { Response } from 'express';
import PDFDocument from 'pdfkit';

type PdfDoc = InstanceType<typeof PDFDocument>;

type PaymentReceipt = {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  created_by_user_id?: string | null;
  receivable?: {
    id: string;
    original_amount: number;
    final_amount: number;
    source_type: string;
    source_id: string;
    guardian?: { full_name?: string | null; phone?: string | null; email?: string | null } | null;
    unit?: { name?: string | null; nickname?: string | null } | null;
    source?: Record<string, unknown> | null;
  } | null;
  clinic?: { name?: string | null; photo_url?: string | null } | null;
};

const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BEIGE = '#faf3ee';
const BORDER = '#e5dcd6';

function brl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function methodLabel(method: string): string {
  const labels: Record<string, string> = {
    pix: 'Pix',
    cash: 'Dinheiro',
    credit_card: 'Cartão de crédito',
    debit_card: 'Cartão de débito',
    transfer: 'Transferência',
    payment_link: 'Link de pagamento',
    customer_credit: 'Crédito do tutor',
  };
  return labels[method] ?? method;
}

function valueRow(doc: PdfDoc, label: string, value: string, x: number, y: number, w: number): number {
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(label, x, y, { width: w });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(value || '—', x, doc.y + 2, { width: w });
  return doc.y + 8;
}

function sourcePetName(source: Record<string, unknown> | null | undefined): string {
  if (!source) return '—';
  const pet = source.pet as { name?: string | null } | { name?: string | null }[] | null | undefined;
  if (Array.isArray(pet)) return pet[0]?.name || '—';
  if (pet?.name) return pet.name;
  const pets = source.pets as Array<{ display_name?: string | null }> | null | undefined;
  return pets?.map((p) => p.display_name).filter(Boolean).join(', ') || '—';
}

export function streamPaymentReceiptPdf(res: Response, receipt: PaymentReceipt): void {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const fileName = `comprovante-${receipt.id.slice(0, 8)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  doc.pipe(res);

  const margin = 40;
  const contentW = doc.page.width - margin * 2;
  const colGap = 16;
  const colW = (contentW - colGap) / 2;
  const x2 = margin + colW + colGap;
  let y = margin;

  const clinicName = receipt.clinic?.name?.trim() || 'Clínica';
  const unitName = receipt.receivable?.unit?.nickname || receipt.receivable?.unit?.name || 'Unidade';
  const guardian = receipt.receivable?.guardian;

  doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT_DARK).text('Comprovante de recebimento', margin, y);
  y = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(22).fillColor(ORANGE).text(clinicName, margin, y, { width: contentW - 180 });
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(10).fillColor(TEXT_MUTED).text(unitName, margin, y);

  const boxX = doc.page.width - margin - 170;
  doc.save();
  doc.roundedRect(boxX, margin, 170, 58, 8).fill(BEIGE);
  doc.restore();
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text('Nº do recebimento', boxX + 12, margin + 10);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ORANGE).text(receipt.id.slice(0, 8).toUpperCase(), boxX + 12, doc.y + 2);
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK).text(new Date(receipt.payment_date).toLocaleString('pt-BR'), boxX + 12, doc.y + 4);

  y = Math.max(doc.y, margin + 68) + 14;
  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 18;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Cliente', margin, y);
  doc.font('Helvetica-Bold').fontSize(12).text('Pagamento', x2, y);
  y = doc.y + 8;

  doc.save();
  doc.roundedRect(margin, y, colW, 118, 6).fill(BEIGE);
  doc.roundedRect(x2, y, colW, 118, 6).fill(BEIGE);
  doc.restore();

  let ly = y + 12;
  ly = valueRow(doc, 'Tutor', guardian?.full_name || '—', margin + 12, ly, colW - 24);
  ly = valueRow(doc, 'Telefone', guardian?.phone || '—', margin + 12, ly, colW - 24);
  ly = valueRow(doc, 'Pet', sourcePetName(receipt.receivable?.source), margin + 12, ly, colW - 24);

  let ry = y + 12;
  ry = valueRow(doc, 'Forma de pagamento', methodLabel(receipt.payment_method), x2 + 12, ry, colW - 24);
  ry = valueRow(doc, 'Valor recebido', brl(receipt.amount), x2 + 12, ry, colW - 24);
  ry = valueRow(doc, 'Usuário responsável', receipt.created_by_user_id ? receipt.created_by_user_id.slice(0, 8) : '—', x2 + 12, ry, colW - 24);

  y += 142;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Valores', margin, y);
  y = doc.y + 8;
  doc.save();
  doc.roundedRect(margin, y, contentW, 76, 6).fill(BEIGE);
  doc.restore();
  const original = Number(receipt.receivable?.original_amount ?? 0);
  const finalAmount = Number(receipt.receivable?.final_amount ?? 0);
  valueRow(doc, 'Valor original', brl(original), margin + 12, y + 12, 150);
  valueRow(doc, 'Desconto / acréscimo', brl(finalAmount - original), margin + 190, y + 12, 150);
  valueRow(doc, 'Valor final', brl(finalAmount), margin + 368, y + 12, 150);

  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(
    'Comprovante gerado pelo PetMi Hub.',
    margin,
    doc.page.height - 64,
    { align: 'center', width: contentW }
  );

  doc.end();
}
