"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamComandaPdf = streamComandaPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const hubPublicDocumentPdf_1 = require("./hubPublicDocumentPdf");
function statusLabelPt(status) {
    const m = {
        aberta: 'Aberta',
        fechada: 'Fechada',
        cancelada: 'Cancelada',
    };
    return m[status] ?? status;
}
function sizeTierLabelPt(tier) {
    const m = {
        mini: 'Mini',
        pequeno: 'Pequeno',
        medio: 'Médio',
        grande: 'Grande',
        gigante: 'Gigante',
    };
    return tier ? m[tier] ?? tier : '—';
}
function drawPetsTable(doc, x, y, width, pets) {
    const cols = [
        { label: 'Nome', w: 0.28 },
        { label: 'Espécie', w: 0.22 },
        { label: 'Raça', w: 0.28 },
        { label: 'Porte', w: 0.22 },
    ];
    let cy = y;
    let tx = x;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(hubPublicDocumentPdf_1.PDF_MUTED);
    cols.forEach((col) => {
        const w = width * col.w;
        doc.text(col.label.toUpperCase(), tx, cy, { width: w });
        tx += w;
    });
    cy = doc.y + 8;
    doc.font('Helvetica').fontSize(9.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT);
    pets.forEach((p) => {
        tx = x;
        const row = [p.name, p.species || '—', p.breed?.trim() || '—', sizeTierLabelPt(p.size_tier)];
        row.forEach((cell, j) => {
            const w = width * cols[j].w;
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
function derivePetsFromItems(items) {
    const byName = new Map();
    for (const it of items) {
        const name = it.pet_name?.trim();
        if (!name)
            continue;
        if (!byName.has(name)) {
            byName.set(name, { id: name, name, species: '—', breed: null, size_tier: '' });
        }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
async function streamComandaPdf(res, payload) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: hubPublicDocumentPdf_1.PDF_MARGIN, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="comanda-${payload.id.slice(0, 8)}.pdf"`);
    doc.pipe(res);
    (0, hubPublicDocumentPdf_1.drawPageShell)(doc);
    const clinic = (0, hubPublicDocumentPdf_1.embedOnePdf)(payload.clinic);
    const clinicName = clinic?.name?.trim() || 'Clínica';
    const guardian = payload.guardian;
    const items = [...payload.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const pets = (payload.pets?.length ? payload.pets : derivePetsFromItems(items)).slice();
    const margin = hubPublicDocumentPdf_1.PDF_MARGIN;
    const contentW = (0, hubPublicDocumentPdf_1.contentWidth)(doc, margin);
    let y = await (0, hubPublicDocumentPdf_1.drawPublicDocumentHeader)(doc, margin, margin, {
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
    const contactBodyH = guardian ? (0, hubPublicDocumentPdf_1.measureDefinitionRowsHeight)(contactRows) : 14;
    const petsBodyH = pets.length > 0 ? measurePetsTableHeight(pets) : 14;
    const cardsH = Math.max(contactBodyH, petsBodyH) + 36;
    y = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, y, cardsH, margin);
    const contactCard = (0, hubPublicDocumentPdf_1.drawSectionCard)(doc, margin, y, colW, 'Dados do contato', contactBodyH);
    if (guardian) {
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
    const servicesRowH = 22;
    const servicesH = 42 + (items.length > 0 ? 24 + items.length * servicesRowH : 36);
    y = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, y, servicesH, margin);
    doc.save();
    doc.roundedRect(margin, y, contentW, servicesH, 12).fill('#ffffff');
    doc.roundedRect(margin, y, contentW, servicesH, 12).strokeColor(hubPublicDocumentPdf_1.PDF_BORDER).lineWidth(1).stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text('Serviços e valores', margin + 16, y + 16);
    let tableY = y + 40;
    if (items.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor(hubPublicDocumentPdf_1.PDF_MUTED).text('Sem itens.', margin + 16, tableY);
    }
    else {
        const wDesc = contentW * 0.42;
        const wPet = contentW * 0.2;
        const wQty = 44;
        const wTotal = contentW - wDesc - wPet - wQty - 32;
        tableY = (0, hubPublicDocumentPdf_1.drawDataTableHeader)(doc, margin + 8, tableY, contentW - 16, [
            { label: 'Serviço', width: wDesc },
            { label: 'Pet', width: wPet },
            { label: 'Qtd', width: wQty, align: 'right' },
            { label: 'Total linha', width: wTotal, align: 'right' },
        ]);
        items.forEach((it) => {
            tableY = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, tableY, servicesRowH + 8, margin);
            const rowTop = tableY;
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text(it.description, margin + 18, rowTop, {
                width: wDesc - 12,
            });
            doc.font('Helvetica').fontSize(9).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text(it.pet_name ?? '—', margin + 18 + wDesc, rowTop, {
                width: wPet - 8,
            });
            doc.text(String(it.quantity), margin + 18 + wDesc + wPet, rowTop, { width: wQty - 6, align: 'right' });
            doc.font('Helvetica-Bold').fontSize(9.5).text((0, hubPublicDocumentPdf_1.brlPdf)(it.line_total), margin + 18 + wDesc + wPet + wQty, rowTop, {
                width: wTotal - 8,
                align: 'right',
            });
            tableY = rowTop + servicesRowH;
            (0, hubPublicDocumentPdf_1.drawTableDivider)(doc, margin + 8, tableY, contentW - 16);
            tableY += 4;
        });
    }
    y = y + servicesH + 8;
    if (payload.client_notes?.trim()) {
        y = (0, hubPublicDocumentPdf_1.drawNotesCard)(doc, margin, y, contentW, (0, hubPublicDocumentPdf_1.clientNotesTitlePdf)(clinicName), payload.client_notes.trim());
    }
    const paid = Number(payload.paid_total ?? 0);
    const balance = Number(payload.balance_due ?? Math.max(0, payload.total_amount - paid));
    const totalRows = [
        { label: 'Subtotal', value: (0, hubPublicDocumentPdf_1.brlPdf)(payload.subtotal_amount) },
        ...(payload.discount_amount > 0
            ? [{ label: 'Desconto', value: `−${(0, hubPublicDocumentPdf_1.brlPdf)(payload.discount_amount)}`, kind: 'discount' }]
            : []),
        { label: 'Total', value: (0, hubPublicDocumentPdf_1.brlPdf)(payload.total_amount), kind: 'grand' },
        ...(paid > 0.009 ? [{ label: 'Pago', value: (0, hubPublicDocumentPdf_1.brlPdf)(paid), kind: 'muted' }] : []),
        ...(balance > 0.009 ? [{ label: 'Pendente', value: (0, hubPublicDocumentPdf_1.brlPdf)(balance), kind: 'warn' }] : []),
    ];
    y = (0, hubPublicDocumentPdf_1.drawTotalsCard)(doc, margin, y, contentW, totalRows);
    y = (0, hubPublicDocumentPdf_1.drawFineprint)(doc, margin, y, contentW, 'Este documento é um resumo de serviços e valores. Em caso de dúvidas, entre em contato com a clínica.');
    doc.end();
}
