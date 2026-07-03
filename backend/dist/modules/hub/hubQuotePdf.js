"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamQuotePdf = streamQuotePdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const hubPublicDocumentPdf_1 = require("./hubPublicDocumentPdf");
function clinicDisplayName(quote) {
    const c = (0, hubPublicDocumentPdf_1.embedOnePdf)(quote.clinic);
    return c?.name?.trim() || 'Clínica';
}
function clinicLogoUrl(quote) {
    const c = (0, hubPublicDocumentPdf_1.embedOnePdf)(quote.clinic);
    return c?.photo_url?.trim() || null;
}
function pricingVariantPdfSuffix(raw) {
    if (!raw || typeof raw !== 'object')
        return '';
    const o = raw;
    if (o.period === 'full_day')
        return ' · Dia completo';
    if (o.period === 'half_day')
        return ' · Meio período';
    if (o.consult_type === 'padrao')
        return ' · Consulta padrão';
    if (o.consult_type === 'retorno')
        return ' · Retorno';
    if (typeof o.km_tier_index === 'number' && Number.isFinite(o.km_tier_index))
        return ` · Faixa ${o.km_tier_index + 1}`;
    if (typeof o.custom_tier_index === 'number' && Number.isFinite(o.custom_tier_index))
        return ` · Opção ${o.custom_tier_index + 1}`;
    return '';
}
function lineServiceEmbed(ln) {
    const raw = ln.hub_service_types;
    if (!raw)
        return null;
    return (0, hubPublicDocumentPdf_1.embedOnePdf)(raw);
}
function lineServiceTitleAndSubtitle(ln) {
    const st = lineServiceEmbed(ln);
    const variant = pricingVariantPdfSuffix(ln.pricing_variant);
    if (st) {
        const title = st.name;
        const sub = (st.description && st.description.trim()) ||
            (ln.description && ln.description.trim() && ln.description.trim() !== st.name ? ln.description.trim() : '') ||
            '';
        return { title: `${title}${variant}`, subtitle: sub };
    }
    const fallback = (ln.description && ln.description.trim()) || 'Serviço';
    return { title: `${fallback}${variant}`, subtitle: '' };
}
function petLabel(p, idx) {
    return (p.display_name && p.display_name.trim()) || `Pet ${idx + 1}`;
}
function sizeTierLabelPt(tier) {
    const m = {
        mini: 'Mini',
        pequeno: 'Pequeno',
        medio: 'Médio',
        grande: 'Grande',
        gigante: 'Gigante',
    };
    return m[tier] ?? tier.charAt(0).toUpperCase() + tier.slice(1);
}
function discountAmount(quote) {
    if (!quote.discount_kind || quote.discount_value <= 0)
        return 0;
    if (quote.discount_kind === 'percent')
        return quote.subtotal_amount * (quote.discount_value / 100);
    return quote.discount_value;
}
function drawPetsTable(doc, x, y, width, pets) {
    const cols = [
        { label: 'Nome', w: 0.28 },
        { label: 'Espécie', w: 0.22 },
        { label: 'Raça', w: 0.28 },
        { label: 'Porte', w: 0.22 },
    ];
    const tw = width;
    let cy = y;
    let tx = x;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(hubPublicDocumentPdf_1.PDF_MUTED);
    cols.forEach((col) => {
        const w = tw * col.w;
        doc.text(col.label.toUpperCase(), tx, cy, { width: w });
        tx += w;
    });
    cy = doc.y + 8;
    doc.font('Helvetica').fontSize(9.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT);
    pets.forEach((p, i) => {
        tx = x;
        const row = [
            petLabel(p, i),
            p.species,
            p.breed?.trim() || '—',
            sizeTierLabelPt(p.size_tier || ''),
        ];
        row.forEach((cell, j) => {
            const w = tw * cols[j].w;
            doc.text(cell, tx, cy, { width: w });
            tx += w;
        });
        cy = doc.y + 6;
    });
    return cy;
}
function measurePetsTableHeight(pets) {
    return 22 + pets.length * 16 + 4;
}
async function streamQuotePdf(res, quote) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: hubPublicDocumentPdf_1.PDF_MARGIN, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="orcamento-${quote.id.slice(0, 8)}.pdf"`);
    doc.pipe(res);
    (0, hubPublicDocumentPdf_1.drawPageShell)(doc);
    const prospect = (0, hubPublicDocumentPdf_1.embedOnePdf)(quote.prospect);
    const pets = (quote.pets ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const lines = (quote.lines ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const clinicName = clinicDisplayName(quote);
    const margin = hubPublicDocumentPdf_1.PDF_MARGIN;
    const contentW = (0, hubPublicDocumentPdf_1.contentWidth)(doc, margin);
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
    let y = await (0, hubPublicDocumentPdf_1.drawPublicDocumentHeader)(doc, margin, margin, {
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
    const contactBodyH = prospect ? (0, hubPublicDocumentPdf_1.measureDefinitionRowsHeight)(contactRows) : 14;
    const petsBodyH = pets.length > 0 ? measurePetsTableHeight(pets) : 14;
    const cardsH = Math.max(contactBodyH, petsBodyH) + 36;
    y = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, y, cardsH, margin);
    const contactCard = (0, hubPublicDocumentPdf_1.drawSectionCard)(doc, margin, y, colW, 'Dados do contato', contactBodyH);
    if (prospect) {
        (0, hubPublicDocumentPdf_1.drawDefinitionRows)(doc, contactCard.innerX, contactCard.innerY, colW - 32, contactRows);
    }
    else {
        doc.font('Helvetica').fontSize(10).fillColor(hubPublicDocumentPdf_1.PDF_MUTED).text('—', contactCard.innerX, contactCard.innerY);
    }
    const petsX = margin + colW + colGap;
    const petsCard = (0, hubPublicDocumentPdf_1.drawSectionCard)(doc, petsX, y, colW, 'Pets', petsBodyH);
    if (pets.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor(hubPublicDocumentPdf_1.PDF_MUTED).text('—', petsCard.innerX, petsCard.innerY);
    }
    else {
        drawPetsTable(doc, petsCard.innerX, petsCard.innerY, colW - 32, pets);
    }
    y = Math.max(contactCard.bottom, petsCard.bottom) + 16;
    const servicesTitleH = 42;
    const servicesRowH = 26;
    const servicesH = servicesTitleH + (lines.length > 0 ? 24 + lines.length * servicesRowH : 40);
    y = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, y, servicesH, margin);
    doc.save();
    doc.roundedRect(margin, y, contentW, servicesH, 12).fill(hubPublicDocumentPdf_1.PDF_WHITE);
    doc.roundedRect(margin, y, contentW, servicesH, 12).strokeColor(hubPublicDocumentPdf_1.PDF_BORDER).lineWidth(1).stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text('Serviços e valores', margin + 16, y + 16);
    let tableY = y + 40;
    if (lines.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor(hubPublicDocumentPdf_1.PDF_MUTED).text('Sem linhas de serviço.', margin + 16, tableY);
        tableY += 24;
    }
    else {
        const petColW = pets.length > 0 ? Math.min(72, (contentW - 200) / pets.length) : 0;
        const wDesc = contentW - 90 - petColW * pets.length - 32;
        const columns = [
            { label: 'Serviço', width: wDesc, align: 'left' },
            ...pets.map((p, i) => ({ label: petLabel(p, i), width: petColW, align: 'right' })),
            { label: 'Total linha', width: 90, align: 'right' },
        ];
        tableY = (0, hubPublicDocumentPdf_1.drawDataTableHeader)(doc, margin + 8, tableY, contentW - 16, columns);
        lines.forEach((ln) => {
            tableY = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, tableY, servicesRowH + 8, margin);
            const rowTop = tableY;
            const { title, subtitle } = lineServiceTitleAndSubtitle(ln);
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text(title, margin + 18, rowTop, {
                width: wDesc - 12,
            });
            if (subtitle) {
                doc.font('Helvetica').fontSize(8.5).fillColor(hubPublicDocumentPdf_1.PDF_MUTED).text(subtitle, margin + 18, doc.y + 1, {
                    width: wDesc - 12,
                });
            }
            let px = margin + 18 + wDesc;
            pets.forEach((p) => {
                const lp = (ln.line_pets ?? []).find((x) => x.quote_pet_id === p.id);
                doc.font('Helvetica').fontSize(9).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text(lp ? (0, hubPublicDocumentPdf_1.brlPdf)(Number(lp.unit_price)) : '—', px, rowTop, {
                    width: petColW - 6,
                    align: 'right',
                });
                px += petColW;
            });
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text((0, hubPublicDocumentPdf_1.brlPdf)(ln.line_total), px, rowTop, {
                width: 82,
                align: 'right',
            });
            tableY = Math.max(doc.y, rowTop + 18) + 6;
            (0, hubPublicDocumentPdf_1.drawTableDivider)(doc, margin + 8, tableY, contentW - 16);
            tableY += 4;
        });
    }
    y = y + servicesH + 8;
    if (quote.client_notes?.trim()) {
        y = (0, hubPublicDocumentPdf_1.drawNotesCard)(doc, margin, y, contentW, (0, hubPublicDocumentPdf_1.clientNotesTitlePdf)(clinicName), quote.client_notes.trim());
    }
    const disc = discountAmount(quote);
    const totalRows = [
        { label: 'Subtotal', value: (0, hubPublicDocumentPdf_1.brlPdf)(quote.subtotal_amount) },
        ...(disc > 0
            ? [
                {
                    label: quote.discount_kind === 'percent'
                        ? `Desconto (${Math.min(100, Math.max(0, quote.discount_value))}%)`
                        : 'Desconto',
                    value: `−${(0, hubPublicDocumentPdf_1.brlPdf)(disc)}`,
                    kind: 'discount',
                },
            ]
            : []),
        { label: 'Total', value: (0, hubPublicDocumentPdf_1.brlPdf)(quote.total_amount), kind: 'grand' },
    ];
    y = (0, hubPublicDocumentPdf_1.drawTotalsCard)(doc, margin, y, contentW, totalRows);
    y = (0, hubPublicDocumentPdf_1.drawFineprint)(doc, margin, y, contentW, 'Valores e horários dependem da disponibilidade da clínica. Este documento é uma proposta; não cria reserva nem cadastro automático.');
    doc.end();
}
