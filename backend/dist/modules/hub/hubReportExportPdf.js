"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubReportExportPdf = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const zod_1 = require("zod");
const hubReportAuthorize_1 = require("./hubReportAuthorize");
const reportsContract_1 = require("./reportsContract");
const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BORDER = '#e5dcd6';
const exportBodySchema = zod_1.z
    .object({
    clinic_id: zod_1.z.string().uuid(),
    report_id: zod_1.z.string().min(1).max(80),
    unit_id: zod_1.z.string().uuid().optional().nullable(),
    title: zod_1.z.string().min(1).max(120).optional(),
    subtitle: zod_1.z.string().max(240).optional().nullable(),
    filename: zod_1.z.string().max(120).optional().nullable(),
    /** Só aceito se report_id ∈ CLIENT_CONTROLLED_PDF_REPORT_IDS (residual). */
    headers: zod_1.z.array(zod_1.z.string().max(80)).min(1).max(20).optional(),
    rows: zod_1.z.array(zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.null()]))).max(800).optional(),
    /** Filtros para geração server-side (quando implementada). */
    filters: zod_1.z
        .object({
        from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        days: zod_1.z.coerce.number().int().min(1).max(366).optional(),
    })
        .optional(),
})
    .strict();
function cellText(v) {
    if (v == null)
        return '—';
    return String(v);
}
function streamPdf(res, opts) {
    const { title, subtitle, headers, rows } = opts;
    const slug = (opts.filename || title)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
    const fileName = `petmi-${slug || 'relatorio'}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const doc = new pdfkit_1.default({
        size: 'A4',
        margin: 40,
        layout: headers.length > 6 ? 'landscape' : 'portrait',
    });
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
/**
 * Server-side stub: relatórios em SERVER_SIDE_PDF_REPORT_IDS.
 * Expandir reutilizando serviços de consulta; por enquanto conjunto vazio.
 */
async function buildServerSidePdfTable(_reportId, _opts) {
    return null;
}
/**
 * PDF de relatório Hub.
 * Exige report_id reconhecido + autorização completa (domínio, unidade, self, audiência).
 * Geração server-side para SERVER_SIDE_PDF_REPORT_IDS; residual cliente documentado em CLIENT_CONTROLLED_PDF_REPORT_IDS.
 */
const postHubReportExportPdf = async (req, res) => {
    try {
        const parsed = exportBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Payload inválido para PDF', details: parsed.error.flatten() });
        }
        const body = parsed.data;
        if (!(0, reportsContract_1.isHubReportId)(body.report_id)) {
            return res.status(400).json({ error: 'report_id inválido ou não reconhecido' });
        }
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const auth = await (0, hubReportAuthorize_1.authorizeHubReport)({
            userId,
            clinicId: body.clinic_id,
            reportId: body.report_id,
            requestedUnitId: body.unit_id,
            requireExportPdf: true,
        });
        if (!auth.ok)
            return res.status(auth.status).json({ error: auth.error });
        const reportId = body.report_id;
        const isServerSide = reportsContract_1.SERVER_SIDE_PDF_REPORT_IDS.includes(reportId);
        const isClientControlled = reportsContract_1.CLIENT_CONTROLLED_PDF_REPORT_IDS.includes(reportId);
        if (isServerSide) {
            const built = await buildServerSidePdfTable(reportId, {
                clinicId: body.clinic_id,
                unitId: auth.unitScope.unitId,
                filters: body.filters,
            });
            if (!built) {
                return res.status(501).json({
                    error: 'Geração server-side ainda não implementada para este relatório',
                    report_id: reportId,
                });
            }
            return streamPdf(res, {
                title: built.title,
                subtitle: built.subtitle,
                filename: body.filename,
                headers: built.headers,
                rows: built.rows,
            });
        }
        if (!isClientControlled) {
            return res.status(400).json({
                error: 'Relatório sem gerador PDF (nem server-side nem residual cliente)',
                report_id: reportId,
            });
        }
        if (!body.headers?.length || !body.rows) {
            return res.status(400).json({
                error: 'Este relatório ainda usa PDF residual controlado pelo cliente: envie headers e rows após carregar os dados pela API do relatório',
                report_id: reportId,
                residual: true,
            });
        }
        return streamPdf(res, {
            title: body.title || auth.report.title,
            subtitle: body.subtitle,
            filename: body.filename,
            headers: body.headers,
            rows: body.rows,
        });
    }
    catch (e) {
        console.error('postHubReportExportPdf', e);
        if (!res.headersSent) {
            return res.status(500).json({ error: e?.message || 'Erro ao gerar PDF' });
        }
    }
};
exports.postHubReportExportPdf = postHubReportExportPdf;
