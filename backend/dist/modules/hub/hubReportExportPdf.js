"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubReportExportPdf = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const zod_1 = require("zod");
const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BORDER = '#e5dcd6';
const exportBodySchema = zod_1.z
    .object({
    clinic_id: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(1).max(120),
    subtitle: zod_1.z.string().max(240).optional().nullable(),
    filename: zod_1.z.string().max(120).optional().nullable(),
    headers: zod_1.z.array(zod_1.z.string().max(80)).min(1).max(20),
    rows: zod_1.z.array(zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.null()]))).max(800),
})
    .strict();
function cellText(v) {
    if (v == null)
        return '—';
    return String(v);
}
/** PDF tabular genérico para exportação de relatórios do Hub. */
const postHubReportExportPdf = async (req, res) => {
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
        const doc = new pdfkit_1.default({ size: 'A4', margin: 40, layout: headers.length > 6 ? 'landscape' : 'portrait' });
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
        }
        else {
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
    }
    catch (e) {
        console.error('postHubReportExportPdf', e);
        if (!res.headersSent) {
            return res.status(500).json({ error: e?.message || 'Erro ao gerar PDF' });
        }
    }
};
exports.postHubReportExportPdf = postHubReportExportPdf;
