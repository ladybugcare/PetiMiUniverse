import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import * as fs from 'node:fs';
import * as path from 'node:path';

type PdfDoc = InstanceType<typeof PDFDocument>;

type QuotePet = {
  id: string;
  display_name: string | null;
  species: string;
  breed: string;
  size_tier: string;
  coat_type: string | null;
  age_months: number | null;
  sex: string | null;
  sort_order: number;
};

type LinePet = {
  quote_pet_id: string;
  unit_price: number;
  applied_porte: string | null;
  applied_coat_type: string | null;
  sort_order: number;
};

type HubServiceTypeEmbed = {
  name: string;
  service_group: string;
  description: string | null;
};

type QuoteLine = {
  id: string;
  hub_service_type_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  sort_order: number;
  pricing_variant?: unknown;
  line_pets?: LinePet[];
  /** PostgREST embed a partir de `hub_service_type_id` */
  hub_service_types?: HubServiceTypeEmbed | HubServiceTypeEmbed[] | null;
};

type Prospect = {
  full_name: string;
  tax_id: string | null;
  phone: string;
  email: string | null;
};

type ClinicEmbed = { name: string | null };

type QuoteFull = {
  id: string;
  status: string;
  notes: string | null;
  client_notes: string | null;
  total_amount: number;
  subtotal_amount: number;
  discount_kind: 'percent' | 'fixed' | null;
  discount_value: number;
  currency: string;
  sent_at: string | null;
  expires_at: string | null;
  valid_days: number;
  created_at: string;
  prospect: Prospect | Prospect[] | null;
  pets?: QuotePet[];
  lines?: QuoteLine[];
  clinic?: ClinicEmbed | ClinicEmbed[] | null;
};

const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BEIGE = '#faf3ee';
const BORDER = '#e5dcd6';
const GREEN_DISC = '#2e7d32';

function brl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

function clinicDisplayName(quote: QuoteFull): string {
  const c = embedOne(quote.clinic);
  const n = c?.name?.trim();
  return n || 'Clínica';
}

function pricingVariantPdfSuffix(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const o = raw as Record<string, unknown>;
  if (o.period === 'full_day') return ' · Dia completo';
  if (o.period === 'half_day') return ' · Meio período';
  if (o.consult_type === 'padrao') return ' · Consulta padrão';
  if (o.consult_type === 'retorno') return ' · Retorno';
  if (typeof o.km_tier_index === 'number' && Number.isFinite(o.km_tier_index))
    return ` · Faixa ${o.km_tier_index + 1}`;
  if (typeof o.custom_tier_index === 'number' && Number.isFinite(o.custom_tier_index))
    return ` · Opção ${o.custom_tier_index + 1}`;
  return '';
}

function lineServiceEmbed(ln: QuoteLine): HubServiceTypeEmbed | null {
  const raw = ln.hub_service_types;
  if (!raw) return null;
  return embedOne(raw);
}

/** Título em destaque + subtítulo (descrição do catálogo ou da linha). */
function lineServiceTitleAndSubtitle(ln: QuoteLine): { title: string; subtitle: string } {
  const st = lineServiceEmbed(ln);
  const variant = pricingVariantPdfSuffix(ln.pricing_variant);
  if (st) {
    const title = st.name;
    const sub =
      (st.description && st.description.trim()) ||
      (ln.description && ln.description.trim() && ln.description.trim() !== st.name ? ln.description.trim() : '') ||
      '';
    return { title: `${title}${variant}`, subtitle: sub };
  }
  const fallback = (ln.description && ln.description.trim()) || 'Serviço';
  return { title: `${fallback}${variant}`, subtitle: '' };
}

function petLabel(p: QuotePet, idx: number): string {
  const name = (p.display_name && p.display_name.trim()) || `Pet ${idx + 1}`;
  return `${name} (${p.species})`;
}

function sizeTierLabelPt(tier: string): string {
  const m: Record<string, string> = {
    mini: 'Mini',
    pequeno: 'Pequeno',
    medio: 'Médio',
    grande: 'Grande',
    gigante: 'Gigante',
  };
  return m[tier] ?? tier.charAt(0).toUpperCase() + tier.slice(1);
}

function resolvePetmiHubLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, '../../../assets/petmi-hub-logo.png'),
    path.join(__dirname, '../../assets/petmi-hub-logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function lineUnitPriceColumn(ln: QuoteLine): string {
  const lps = [...(ln.line_pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (lps.length === 0) return brl(ln.unit_price);
  const prices = lps.map((p) => Math.round(Number(p.unit_price || 0) * 100) / 100);
  const first = prices[0];
  if (prices.every((x) => x === first)) return brl(first ?? 0);
  return '—';
}

function drawFootersOnAllPages(doc: PdfDoc, logoPath: string | null): void {
  if (!logoPath) return;
  const range = doc.bufferedPageRange();
  const pageW = doc.page.width;
  const margin = 40;
  const logoW = 88;
  const logoH = 28;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerTop = doc.page.height - margin - logoH - 4;
    const cx = pageW / 2;
    try {
      doc.image(logoPath, cx - logoW / 2, footerTop, { width: logoW, height: logoH, fit: [logoW, logoH] });
    } catch {
      /* ignore missing/corrupt image */
    }
  }
}

export function streamQuotePdf(res: Response, quote: QuoteFull): void {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="orcamento-${quote.id.slice(0, 8)}.pdf"`,
  );
  doc.pipe(res);

  const prospect = embedOne(quote.prospect);
  const pets = (quote.pets ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const clinicName = clinicDisplayName(quote);
  const logoPath = resolvePetmiHubLogoPath();

  const margin = 40;
  const contentW = doc.page.width - margin * 2;
  const rightBoxW = 200;
  const leftBlockW = contentW - rightBoxW - 16;

  let y = margin;

  doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT_DARK).text('Orçamento', margin, y, { width: leftBlockW });
  y = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(22).fillColor(ORANGE).text(clinicName, margin, y, { width: leftBlockW });
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(10).fillColor(TEXT_MUTED).text('Proposta personalizada para o seu pet.', margin, y, {
    width: leftBlockW,
  });

  const boxTop = margin;
  const boxX = doc.page.width - margin - rightBoxW;
  const rightBoxH = quote.expires_at ? 58 : 44;
  doc.save();
  doc.roundedRect(boxX, boxTop, rightBoxW, rightBoxH, 8).fill(BEIGE);
  doc.restore();

  let boxY = boxTop + 10;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text('Nº ', boxX + 12, boxY, { continued: true });
  doc.font('Helvetica-Bold').fillColor(ORANGE).text(quote.id.slice(0, 8).toUpperCase(), { continued: false });
  boxY = doc.y + 4;
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK);
  doc.text(`Criado em: ${new Date(quote.created_at).toLocaleString('pt-BR')}`, boxX + 12, boxY, { width: rightBoxW - 20 });
  boxY = doc.y + 2;
  if (quote.expires_at) {
    doc.text(`Válido até: ${new Date(quote.expires_at).toLocaleDateString('pt-BR')}`, boxX + 12, boxY, {
      width: rightBoxW - 20,
    });
    boxY = doc.y + 2;
  }

  y = Math.max(doc.y, boxTop + rightBoxH) + 14;

  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 14;

  const colGap = 16;
  const colW = (contentW - colGap) / 2;
  const x2 = margin + colW + colGap;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Dados do contato', margin, y);
  doc.font('Helvetica-Bold').fontSize(12).text('Pets do orçamento', x2, y);
  y = doc.y + 6;

  doc.save();
  doc.roundedRect(margin, y, colW, 72, 6).fill(BEIGE);
  doc.roundedRect(x2, y, colW, Math.max(72, 22 + pets.length * 18), 6).fill(BEIGE);
  doc.restore();

  const innerPad = 12;
  let y1 = y + innerPad;
  doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK);
  if (prospect) {
    doc.text(`Nome: ${prospect.full_name}`, margin + innerPad, y1, { width: colW - innerPad * 2 });
    y1 = doc.y + 2;
    doc.text(`Telefone: ${prospect.phone}`, margin + innerPad, y1, { width: colW - innerPad * 2 });
    y1 = doc.y + 2;
    if (prospect.tax_id) {
      doc.text(`CPF: ${prospect.tax_id}`, margin + innerPad, y1, { width: colW - innerPad * 2 });
      y1 = doc.y + 2;
    }
    if (prospect.email) doc.text(`E-mail: ${prospect.email}`, margin + innerPad, y1, { width: colW - innerPad * 2 });
  } else {
    doc.text('—', margin + innerPad, y1, { width: colW - innerPad * 2 });
  }

  let y2 = y + innerPad;
  if (pets.length === 0) {
    doc.font('Helvetica').fontSize(10).text('—', x2 + innerPad, y2, { width: colW - innerPad * 2 });
  } else {
    const th = ['Nome do pet', 'Espécie', 'Raça', 'Porte'];
    const cw = [0.28, 0.22, 0.28, 0.22];
    const tw = colW - innerPad * 2;
    let tx = x2 + innerPad;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TEXT_MUTED);
    th.forEach((h, i) => {
      const w = tw * cw[i]!;
      doc.text(h, tx, y2, { width: w });
      tx += w;
    });
    y2 = doc.y + 4;
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK);
    pets.forEach((p, i) => {
      tx = x2 + innerPad;
      const row = [
        (p.display_name && p.display_name.trim()) || `Pet ${i + 1}`,
        p.species,
        p.breed || '—',
        sizeTierLabelPt(p.size_tier || ''),
      ];
      row.forEach((cell, j) => {
        const w = tw * cw[j]!;
        doc.text(cell, tx, y2, { width: w });
        tx += w;
      });
      y2 = doc.y + 2;
    });
  }

  y = y + Math.max(72, 22 + pets.length * 18) + 18;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Serviços e valores', margin, y);
  y = doc.y + 8;

  const lines = (quote.lines ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const wDesc = 168;
  const wPets = 168;
  const wUnit = 86;
  const wTot = contentW - wDesc - wPets - wUnit;

  if (lines.length === 0) {
    doc.font('Helvetica').fontSize(11).text('—', margin, y);
    y = doc.y + 16;
  } else {
    doc.save();
    doc.rect(margin, y, contentW, 22).fill(BEIGE);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED);
    let hx = margin + 8;
    doc.text('SERVIÇO', hx, y + 6, { width: wDesc - 8 });
    hx += wDesc;
    doc.text('DETALHES POR PET', hx, y + 6, { width: wPets - 8 });
    hx += wPets;
    doc.text('VALOR UNIT.', hx, y + 6, { width: wUnit - 8, align: 'right' });
    hx += wUnit;
    doc.text('TOTAL', hx, y + 6, { width: wTot - 8, align: 'right' });
    y += 26;

    doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK);
    lines.forEach((ln) => {
      const rowTop = y;
      const { title, subtitle } = lineServiceTitleAndSubtitle(ln);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text(title, margin + 4, y, { width: wDesc - 8 });
      const titleBottom = doc.y;
      if (subtitle) {
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MUTED).text(subtitle, margin + 4, doc.y + 1, {
          width: wDesc - 8,
        });
      }
      const lpBreakdown = (ln.line_pets ?? [])
        .map((lp) => {
          const pet = pets.find((p) => p.id === lp.quote_pet_id);
          if (!pet) return null;
          const idx = pets.indexOf(pet);
          return `${petLabel(pet, idx)}: ${brl(lp.unit_price)}`;
        })
        .filter(Boolean)
        .join('\n');
      const breakdownText = lpBreakdown || `Qtd ${ln.quantity} × ${brl(ln.unit_price)}`;
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK).text(breakdownText, margin + wDesc + 4, rowTop, {
        width: wPets - 8,
      });
      const midY = Math.max(doc.y, titleBottom + (subtitle ? 12 : 0));

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(TEXT_MUTED)
        .text(lineUnitPriceColumn(ln), margin + wDesc + wPets + 4, rowTop, {
          width: wUnit - 8,
          align: 'right',
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(TEXT_DARK)
        .text(brl(ln.line_total), margin + wDesc + wPets + wUnit + 4, rowTop, { width: wTot - 8, align: 'right' });

      y = Math.max(midY, rowTop + 18) + 8;
      doc.moveTo(margin, y - 4).lineTo(margin + contentW, y - 4).strokeColor('#f5efea').lineWidth(0.5).stroke();
    });
  }

  y += 12;
  doc.font('Helvetica').fontSize(11).fillColor(TEXT_DARK);
  doc.text(`Subtotal: ${brl(quote.subtotal_amount)}`, margin, y, { width: contentW, align: 'right' });
  y = doc.y + 4;
  if (quote.discount_kind && quote.discount_value > 0) {
    const label = quote.discount_kind === 'percent' ? `Desconto (${quote.discount_value}%)` : 'Desconto';
    const amount =
      quote.discount_kind === 'percent'
        ? quote.subtotal_amount * (quote.discount_value / 100)
        : quote.discount_value;
    doc.fillColor(GREEN_DISC).text(`${label}: −${brl(amount)}`, margin, y, { width: contentW, align: 'right' });
    y = doc.y + 4;
  }
  doc.font('Helvetica-Bold').fontSize(18).fillColor(ORANGE);
  doc.text(`Total: ${brl(quote.total_amount)}`, margin, y, { width: contentW, align: 'right' });
  y = doc.y + 20;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Observações', margin, y);
  y = doc.y + 6;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED);
  const bullets: string[] = [];
  if (quote.expires_at) {
    bullets.push(
      `Esta proposta é válida até ${new Date(quote.expires_at).toLocaleDateString('pt-BR', { dateStyle: 'long' })}.`,
    );
  }
  bullets.push('Valores e horários estão sujeitos à disponibilidade da unidade.');
  bullets.push('Este orçamento é temporário e não cria cadastros no sistema até ser aprovado.');
  bullets.forEach((b) => {
    doc.text(`• ${b}`, margin, y, { width: contentW });
    y = doc.y + 3;
  });
  y += 8;

  if (quote.client_notes) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text('Mensagem para o cliente', margin, y);
    y = doc.y + 4;
    doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK).text(quote.client_notes, margin, y, { width: contentW });
    y = doc.y + 12;
  }

  doc.moveDown(1);
  drawFootersOnAllPages(doc, logoPath);
  doc.end();
}
