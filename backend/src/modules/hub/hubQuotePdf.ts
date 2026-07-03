import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import {
  PDF_MARGIN,
  PDF_MUTED,
  PDF_TEXT,
  PDF_WHITE,
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
  hub_service_types?: HubServiceTypeEmbed | HubServiceTypeEmbed[] | null;
};

type Prospect = {
  full_name: string;
  tax_id: string | null;
  phone: string;
  email: string | null;
};

type ClinicEmbed = { name: string | null; photo_url?: string | null };

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

function clinicDisplayName(quote: QuoteFull): string {
  const c = embedOnePdf(quote.clinic);
  return c?.name?.trim() || 'Clínica';
}

function clinicLogoUrl(quote: QuoteFull): string | null {
  const c = embedOnePdf(quote.clinic);
  return c?.photo_url?.trim() || null;
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
  return embedOnePdf(raw);
}

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
  return (p.display_name && p.display_name.trim()) || `Pet ${idx + 1}`;
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

function discountAmount(quote: QuoteFull): number {
  if (!quote.discount_kind || quote.discount_value <= 0) return 0;
  if (quote.discount_kind === 'percent') return quote.subtotal_amount * (quote.discount_value / 100);
  return quote.discount_value;
}

function drawPetsTable(doc: PdfDoc, x: number, y: number, width: number, pets: QuotePet[]): number {
  const cols = [
    { label: 'Nome', w: 0.28 },
    { label: 'Espécie', w: 0.22 },
    { label: 'Raça', w: 0.28 },
    { label: 'Porte', w: 0.22 },
  ];
  const tw = width;
  let cy = y;
  let tx = x;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_MUTED);
  cols.forEach((col) => {
    const w = tw * col.w;
    doc.text(col.label.toUpperCase(), tx, cy, { width: w });
    tx += w;
  });
  cy = doc.y + 8;
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_TEXT);
  pets.forEach((p, i) => {
    tx = x;
    const row = [
      petLabel(p, i),
      p.species,
      p.breed?.trim() || '—',
      sizeTierLabelPt(p.size_tier || ''),
    ];
    row.forEach((cell, j) => {
      const w = tw * cols[j]!.w;
      doc.text(cell, tx, cy, { width: w });
      tx += w;
    });
    cy = doc.y + 6;
  });
  return cy;
}

function measurePetsTableHeight(pets: QuotePet[]): number {
  return 22 + pets.length * 16 + 4;
}

export async function streamQuotePdf(res: Response, quote: QuoteFull): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="orcamento-${quote.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  drawPageShell(doc);

  const prospect = embedOnePdf(quote.prospect);
  const pets = (quote.pets ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const lines = (quote.lines ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const clinicName = clinicDisplayName(quote);
  const margin = PDF_MARGIN;
  const contentW = contentWidth(doc, margin);

  const metaRows = [
    { label: 'Referência', value: quote.id.slice(0, 8).toUpperCase(), accent: true },
    { label: 'Criado em', value: new Date(quote.created_at).toLocaleString('pt-BR') },
  ];
  if (quote.expires_at) {
    metaRows.push({
      label: 'Válido até',
      value: new Date(quote.expires_at).toLocaleDateString('pt-BR', { dateStyle: 'long' }),
    });
  }

  let y = await drawPublicDocumentHeader(doc, margin, margin, {
    eyebrow: 'Orçamento',
    clinicName,
    tagline: 'Proposta personalizada para o seu pet.',
    metaRows,
    clinicLogoUrl: clinicLogoUrl(quote),
  });

  const colGap = 14;
  const colW = (contentW - colGap) / 2;
  const contactRows = prospect
    ? [
        { label: 'Nome', value: prospect.full_name },
        { label: 'Telefone', value: prospect.phone },
        ...(prospect.tax_id ? [{ label: 'CPF', value: prospect.tax_id }] : []),
        ...(prospect.email ? [{ label: 'E-mail', value: prospect.email }] : []),
      ]
    : [];
  const contactBodyH = prospect ? measureDefinitionRowsHeight(contactRows) : 14;
  const petsBodyH = pets.length > 0 ? measurePetsTableHeight(pets) : 14;
  const cardsH = Math.max(contactBodyH, petsBodyH) + 36;

  y = ensurePdfSpace(doc, y, cardsH, margin);

  const contactCard = drawSectionCard(doc, margin, y, colW, 'Dados do contato', contactBodyH);
  if (prospect) {
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

  const servicesTitleH = 42;
  const servicesRowH = 26;
  const servicesH = servicesTitleH + (lines.length > 0 ? 24 + lines.length * servicesRowH : 40);
  y = ensurePdfSpace(doc, y, servicesH, margin);

  doc.save();
  doc.roundedRect(margin, y, contentW, servicesH, 12).fill(PDF_WHITE);
  doc.roundedRect(margin, y, contentW, servicesH, 12).strokeColor(PDF_BORDER).lineWidth(1).stroke();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(PDF_TEXT).text('Serviços e valores', margin + 16, y + 16);

  let tableY = y + 40;
  if (lines.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(PDF_MUTED).text('Sem linhas de serviço.', margin + 16, tableY);
    tableY += 24;
  } else {
    const petColW = pets.length > 0 ? Math.min(72, (contentW - 200) / pets.length) : 0;
    const wDesc = contentW - 90 - petColW * pets.length - 32;
    const columns = [
      { label: 'Serviço', width: wDesc, align: 'left' as const },
      ...pets.map((p, i) => ({ label: petLabel(p, i), width: petColW, align: 'right' as const })),
      { label: 'Total linha', width: 90, align: 'right' as const },
    ];
    tableY = drawDataTableHeader(doc, margin + 8, tableY, contentW - 16, columns);

    lines.forEach((ln) => {
      tableY = ensurePdfSpace(doc, tableY, servicesRowH + 8, margin);
      const rowTop = tableY;
      const { title, subtitle } = lineServiceTitleAndSubtitle(ln);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PDF_TEXT).text(title, margin + 18, rowTop, {
        width: wDesc - 12,
      });
      if (subtitle) {
        doc.font('Helvetica').fontSize(8.5).fillColor(PDF_MUTED).text(subtitle, margin + 18, doc.y + 1, {
          width: wDesc - 12,
        });
      }
      let px = margin + 18 + wDesc;
      pets.forEach((p) => {
        const lp = (ln.line_pets ?? []).find((x) => x.quote_pet_id === p.id);
        doc.font('Helvetica').fontSize(9).fillColor(PDF_TEXT).text(lp ? brlPdf(Number(lp.unit_price)) : '—', px, rowTop, {
          width: petColW - 6,
          align: 'right',
        });
        px += petColW;
      });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PDF_TEXT).text(brlPdf(ln.line_total), px, rowTop, {
        width: 82,
        align: 'right',
      });
      tableY = Math.max(doc.y, rowTop + 18) + 6;
      drawTableDivider(doc, margin + 8, tableY, contentW - 16);
      tableY += 4;
    });
  }

  y = y + servicesH + 8;

  if (quote.client_notes?.trim()) {
    y = drawNotesCard(doc, margin, y, contentW, clientNotesTitlePdf(clinicName), quote.client_notes.trim());
  }

  const disc = discountAmount(quote);
  const totalRows = [
    { label: 'Subtotal', value: brlPdf(quote.subtotal_amount) },
    ...(disc > 0
      ? [
          {
            label:
              quote.discount_kind === 'percent'
                ? `Desconto (${Math.min(100, Math.max(0, quote.discount_value))}%)`
                : 'Desconto',
            value: `−${brlPdf(disc)}`,
            kind: 'discount' as const,
          },
        ]
      : []),
    { label: 'Total', value: brlPdf(quote.total_amount), kind: 'grand' as const },
  ];
  y = drawTotalsCard(doc, margin, y, contentW, totalRows);

  y = drawFineprint(
    doc,
    margin,
    y,
    contentW,
    'Valores e horários dependem da disponibilidade da clínica. Este documento é uma proposta; não cria reserva nem cadastro automático.',
  );

  doc.end();
}
