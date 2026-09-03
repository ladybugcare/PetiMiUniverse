"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubSeriesInvoiceRunJob = exports.postHubSeriesInvoiceIssue = void 0;
const zod_1 = require("zod");
const hubSeriesBillingService_1 = require("./hubSeriesBillingService");
const uuidStr = zod_1.z.string().uuid();
/** POST /api/hub/finance/series-invoices/issue — emissão manual de fatura do mês. */
const postHubSeriesInvoiceIssue = async (req, res) => {
    try {
        const parsed = zod_1.z
            .object({
            clinic_id: uuidStr,
            series_id: uuidStr,
            ref_ymd: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            force: zod_1.z.boolean().optional(),
        })
            .strict()
            .safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const result = await (0, hubSeriesBillingService_1.issueSeriesInvoiceForPeriod)({
            clinicId: parsed.data.clinic_id,
            seriesId: parsed.data.series_id,
            refYmd: parsed.data.ref_ymd,
            force: parsed.data.force ?? true,
            actorUserId: req.user?.id ?? null,
        });
        return res.status(result.already_issued ? 200 : 201).json(result);
    }
    catch (e) {
        const msg = e?.message || 'Erro interno';
        if (msg === 'SERIES_NOT_FOUND')
            return res.status(404).json({ error: 'Série não encontrada' });
        if (msg === 'SERIES_NOT_PERIODIC') {
            return res.status(409).json({ error: 'Esta série não está configurada para fatura periódica' });
        }
        if (msg === 'NO_OCCURRENCES') {
            return res.status(409).json({ error: 'Nenhuma ocorrência válida no mês para faturar' });
        }
        if (msg === 'NO_GUARDIAN' || msg === 'NO_UNIT') {
            return res.status(409).json({ error: 'Série sem tutor ou unidade para emitir a fatura' });
        }
        if (msg === 'ISSUE_DATE_IN_FUTURE') {
            return res.status(409).json({ error: 'Data de emissão ainda não chegou (use force=true para emitir agora)' });
        }
        console.error('postHubSeriesInvoiceIssue', e);
        return res.status(500).json({ error: msg });
    }
};
exports.postHubSeriesInvoiceIssue = postHubSeriesInvoiceIssue;
/** POST /api/hub/finance/series-invoices/run-job — job diário (cron / admin). */
const postHubSeriesInvoiceRunJob = async (req, res) => {
    try {
        const parsed = zod_1.z
            .object({
            clinic_id: uuidStr.optional(),
            ref_ymd: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
            .strict()
            .safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const result = await (0, hubSeriesBillingService_1.runSeriesInvoiceIssuanceJob)({
            clinicId: parsed.data.clinic_id,
            refYmd: parsed.data.ref_ymd,
        });
        return res.json(result);
    }
    catch (e) {
        console.error('postHubSeriesInvoiceRunJob', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubSeriesInvoiceRunJob = postHubSeriesInvoiceRunJob;
