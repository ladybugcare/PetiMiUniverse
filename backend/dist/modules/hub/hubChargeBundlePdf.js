"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamChargeBundlePdf = streamChargeBundlePdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const hubPublicDocumentPdf_1 = require("./hubPublicDocumentPdf");
function formatDueDatePt(iso) {
    if (!iso)
        return '—';
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime()))
        return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function drawItemsTable(doc, x, y, width, items) {
    const wDesc = width * 0.46;
    const wPet = width * 0.22;
    const wDue = width * 0.16;
    const wVal = width - wDesc - wPet - wDue;
    const cols = [
        { label: 'Descrição', width: wDesc },
        { label: 'Pet(s)', width: wPet },
        { label: 'Vencimento', width: wDue },
        { label: 'Valor', width: wVal, align: 'right' },
    ];
    let cy = (0, hubPublicDocumentPdf_1.drawDataTableHeader)(doc, x, y, width, cols);
    doc.font('Helvetica').fontSize(9.5).fillColor(hubPublicDocumentPdf_1.PDF_TEXT);
    for (const it of items) {
        const pets = it.pet_names.length ? it.pet_names.join(', ') : '—';
        const row = [it.title, pets, formatDueDatePt(it.due_date), (0, hubPublicDocumentPdf_1.brlPdf)(it.balance_amount)];
        let tx = x + 10;
        row.forEach((cell, j) => {
            const colW = cols[j].width;
            doc.text(cell, tx, cy + 4, { width: colW - 8, align: cols[j].align ?? 'left' });
            tx += colW;
        });
        cy += 22;
    }
    return cy;
}
async function streamChargeBundlePdf(res, payload) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: hubPublicDocumentPdf_1.PDF_MARGIN, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="cobranca-lote-${payload.id.slice(0, 8)}.pdf"`);
    doc.pipe(res);
    (0, hubPublicDocumentPdf_1.drawPageShell)(doc);
    const clinic = (0, hubPublicDocumentPdf_1.embedOnePdf)(payload.clinic);
    const clinicName = clinic?.name?.trim() || 'Clínica';
    const margin = hubPublicDocumentPdf_1.PDF_MARGIN;
    const contentW = (0, hubPublicDocumentPdf_1.contentWidth)(doc, margin);
    const items = payload.items.slice();
    let y = await (0, hubPublicDocumentPdf_1.drawPublicDocumentHeader)(doc, margin, margin, {
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
        const card = (0, hubPublicDocumentPdf_1.drawSectionCard)(doc, margin, y, contentW, 'Tutor', 48);
        doc.font('Helvetica').fontSize(10).fillColor(hubPublicDocumentPdf_1.PDF_TEXT);
        doc.text(guardian.full_name, card.innerX, card.innerY);
        if (guardian.phone?.trim())
            doc.text(`Telefone: ${guardian.phone.trim()}`, card.innerX, doc.y + 4);
        if (guardian.email?.trim())
            doc.text(`E-mail: ${guardian.email.trim()}`, card.innerX, doc.y + 4);
        y = card.bottom + 16;
    }
    y = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, y, 40 + items.length * 18, margin);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text('Itens do lote', margin, y);
    y = doc.y + 10;
    y = drawItemsTable(doc, margin, y, contentW, items);
    y += 8;
    (0, hubPublicDocumentPdf_1.drawTableDivider)(doc, margin, y, contentW);
    y += 12;
    const totals = [
        { label: 'Total do lote', value: (0, hubPublicDocumentPdf_1.brlPdf)(payload.total_amount) },
        { label: 'Saldo em aberto', value: (0, hubPublicDocumentPdf_1.brlPdf)(payload.balance_due), accent: payload.balance_due > 0.009 },
    ];
    y = (0, hubPublicDocumentPdf_1.drawTotalsCard)(doc, margin, y, contentW, totals);
    if (payload.notes?.trim()) {
        y += 12;
        y = (0, hubPublicDocumentPdf_1.ensurePdfSpace)(doc, y, 60, margin);
        const notesCard = (0, hubPublicDocumentPdf_1.drawSectionCard)(doc, margin, y, contentW, 'Observações', 40);
        doc.font('Helvetica').fontSize(10).fillColor(hubPublicDocumentPdf_1.PDF_TEXT).text(payload.notes.trim(), notesCard.innerX, notesCard.innerY, {
            width: contentW - 32,
        });
        y = notesCard.bottom;
    }
    y += 16;
    (0, hubPublicDocumentPdf_1.drawFineprint)(doc, margin, y, contentW, 'Este documento consolida cobranças em aberto. Pagamentos parciais podem ser registrados separadamente pela clínica.');
    doc.end();
}
