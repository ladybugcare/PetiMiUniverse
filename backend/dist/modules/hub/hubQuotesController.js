"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeManualConversionHubQuote = exports.convertHubQuote = exports.suggestQuotePrice = exports.getHubQuotePdf = exports.getPublicQuote = exports.ensurePublicToken = exports.reopenHubQuoteAsDraft = exports.duplicateHubQuote = exports.cancelHubQuote = exports.awaitingReturnHubQuote = exports.sendHubQuote = exports.deleteHubQuote = exports.patchHubQuote = exports.createHubQuote = exports.getHubQuote = exports.listHubQuotes = void 0;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubPricingResolve_1 = require("./hubPricingResolve");
const hubQuotePdf_1 = require("./hubQuotePdf");
const uuidStr = zod_1.z.string().uuid();
const DEFAULT_VALID_DAYS = 7;
function normalizeTaxId(raw) {
    if (!raw)
        return '';
    return String(raw).replace(/\D/g, '');
}
/** Rascunho: ≥1 pet com espécie; ≥1 linha com tipo de serviço UUID; subtotal > 0. */
function validateQuoteDraftPetsAndLines(pets, lines) {
    const plist = pets ?? [];
    if (plist.length < 1)
        return 'Inclua pelo menos um pet no orçamento.';
    for (let i = 0; i < plist.length; i++) {
        if (!String(plist[i]?.species ?? '').trim())
            return `Pet ${i + 1}: indique a espécie.`;
    }
    const llist = lines ?? [];
    const uuidOk = (s) => uuidStr.safeParse(s).success;
    let anyService = false;
    let subtotal = 0;
    for (const ln of llist) {
        const hid = String(ln.hub_service_type_id ?? '').trim();
        if (!hid || !uuidOk(hid))
            continue;
        anyService = true;
        for (const lp of ln.line_pets ?? []) {
            subtotal += Number(lp.unit_price ?? 0);
        }
    }
    if (!anyService)
        return 'Adicione pelo menos uma linha de serviço e escolha o tipo de serviço.';
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
        return 'Informe valores (R$) superiores a zero para os serviços por pet.';
    }
    return null;
}
const sizeTierSchema = zod_1.z.enum(['mini', 'pequeno', 'medio', 'grande', 'gigante']);
const sexSchema = zod_1.z.enum(['M', 'F', 'U']);
const discountKindSchema = zod_1.z.enum(['percent', 'fixed']);
const quotePetInputSchema = zod_1.z.object({
    id: uuidStr.optional(),
    client_id: zod_1.z.string().trim().min(1).max(80).optional(),
    display_name: zod_1.z.string().trim().max(200).optional().nullable(),
    species: zod_1.z.string().trim().min(1).max(120),
    breed: zod_1.z.string().trim().min(1).max(200),
    size_tier: sizeTierSchema,
    coat_type: zod_1.z.string().trim().max(40).optional().nullable(),
    age_months: zod_1.z.coerce.number().int().min(0).max(720).optional().nullable(),
    sex: sexSchema.optional().nullable(),
    sort_order: zod_1.z.number().int().min(0).max(9999).optional(),
});
const pricingVariantSchema = zod_1.z
    .object({
    period: zod_1.z.enum(['full_day', 'half_day']).optional(),
    consult_type: zod_1.z.enum(['padrao', 'retorno']).optional(),
    km_tier_index: zod_1.z.coerce.number().int().min(0).max(99).optional(),
    custom_tier_index: zod_1.z.coerce.number().int().min(0).max(99).optional(),
})
    .strict();
function normalizeLinePricingVariant(pv) {
    if (pv == null)
        return null;
    const parsed = pricingVariantSchema.safeParse(pv);
    if (!parsed.success)
        return null;
    const o = parsed.data;
    const out = {};
    if (o.period)
        out.period = o.period;
    if (o.consult_type)
        out.consult_type = o.consult_type;
    if (o.km_tier_index != null)
        out.km_tier_index = o.km_tier_index;
    if (o.custom_tier_index != null)
        out.custom_tier_index = o.custom_tier_index;
    return Object.keys(out).length ? out : null;
}
const linePetInputSchema = zod_1.z.object({
    pet_client_id: zod_1.z.string().trim().min(1).max(80).optional(),
    quote_pet_id: uuidStr.optional(),
    pet_index: zod_1.z.number().int().min(0).max(99).optional(),
    unit_price: zod_1.z.coerce.number().min(0).max(99_999_999.99),
    applied_porte: zod_1.z.string().trim().max(40).optional().nullable(),
    applied_coat_type: zod_1.z.string().trim().max(40).optional().nullable(),
    sort_order: zod_1.z.number().int().min(0).max(9999).optional(),
});
const quoteLineInputSchema = zod_1.z.object({
    id: uuidStr.optional(),
    hub_service_type_id: uuidStr.optional().nullable(),
    description: zod_1.z.string().trim().max(500).optional().nullable(),
    /** Mantido por compatibilidade — quantity padrão é 1; o cálculo por pet vem de `line_pets`. */
    quantity: zod_1.z.coerce.number().positive().max(999_999).optional(),
    /** Fallback quando `line_pets` está vazio (linha de serviço sem split por pet). */
    unit_price: zod_1.z.coerce.number().min(0).max(99_999_999.99).optional(),
    discount_amount: zod_1.z.coerce.number().min(0).max(99_999_999.99).optional(),
    sort_order: zod_1.z.number().int().min(0).max(9999).optional(),
    /** Período / consulta / faixa km quando a matriz de preços exige escolha explícita. */
    pricing_variant: pricingVariantSchema.nullable().optional(),
    line_pets: zod_1.z.array(linePetInputSchema).max(50).optional(),
});
const inlineProspectSchema = zod_1.z.object({
    full_name: zod_1.z.string().trim().min(1).max(200),
    tax_id: zod_1.z.string().trim().min(1, 'CPF/CNPJ é obrigatório').max(32),
    phone: zod_1.z.string().trim().min(1).max(40),
    email: zod_1.z.string().trim().max(254).optional().nullable(),
}).refine((o) => {
    const d = normalizeTaxId(o.tax_id);
    return d.length === 11 || d.length === 14;
}, { message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos', path: ['tax_id'] });
const sharedQuoteFieldsSchema = {
    notes: zod_1.z.string().trim().max(8000).optional().nullable(),
    client_notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    total_amount: zod_1.z.coerce.number().min(0).max(99_999_999.99).optional(),
    discount_kind: discountKindSchema.optional().nullable(),
    discount_value: zod_1.z.coerce.number().min(0).max(99_999_999.99).optional(),
    valid_days: zod_1.z.coerce.number().int().min(1).max(90).optional(),
    expires_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    pets: zod_1.z.array(quotePetInputSchema).max(20).optional(),
    lines: zod_1.z.array(quoteLineInputSchema).max(100).optional(),
};
const createQuoteBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    prospect_id: uuidStr.optional(),
    prospect: inlineProspectSchema.optional(),
    unit_id: uuidStr.optional().nullable(),
    ...sharedQuoteFieldsSchema,
})
    .strict()
    .refine((b) => b.prospect_id || b.prospect, { message: 'Indique prospect_id ou prospect' });
const patchQuoteBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    ...sharedQuoteFieldsSchema,
})
    .strict();
const convertQuoteBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    link_to_guardian_id: uuidStr.optional(),
    guardian: zod_1.z
        .object({
        full_name: zod_1.z.string().trim().min(1).max(200).optional(),
        notes: zod_1.z.string().trim().max(8000).optional().nullable(),
    })
        .optional(),
})
    .strict();
const finalizeManualConversionBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    guardian_id: uuidStr,
    manual_pet_links: zod_1.z
        .array(zod_1.z.object({
        quote_pet_id: uuidStr,
        hub_pet_id: uuidStr,
    }))
        .min(1)
        .max(20),
})
    .strict();
const suggestPriceBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    hub_service_type_id: uuidStr,
    pet: zod_1.z.object({
        size_tier: sizeTierSchema,
        coat_type: zod_1.z.string().trim().max(40).optional().nullable(),
        birth_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    }),
    pricing_variant: pricingVariantSchema.optional(),
})
    .strict();
function roundMoney2(n) {
    return Math.round(n * 100) / 100;
}
function addDaysIso(d, days) {
    const x = new Date(d.getTime());
    x.setUTCDate(x.getUTCDate() + days);
    return x.toISOString();
}
function applyQuoteDiscount(subtotal, kind, value) {
    const v = value ?? 0;
    if (!kind || v <= 0)
        return subtotal;
    if (kind === 'percent') {
        const pct = Math.min(100, Math.max(0, v));
        return roundMoney2(Math.max(0, subtotal - (subtotal * pct) / 100));
    }
    return roundMoney2(Math.max(0, subtotal - v));
}
async function refreshExpiredQuotesForClinic(clinicId) {
    const now = new Date().toISOString();
    const { error } = await supabase_1.supabaseAdmin
        .from('hub_quotes')
        .update({ status: 'expired', updated_at: now })
        .eq('clinic_id', clinicId)
        .in('status', ['sent', 'awaiting_return'])
        .lt('expires_at', now);
    if (error) {
        console.warn('[hub_quotes] refreshExpiredQuotesForClinic', error.message);
    }
}
function computeLineTotalFromPets(linePets) {
    return roundMoney2(linePets.reduce((acc, lp) => acc + (lp.unit_price || 0), 0));
}
async function replaceQuotePets(quoteId, pets) {
    await supabase_1.supabaseAdmin.from('hub_quote_pets').delete().eq('quote_id', quoteId);
    const map = new Map();
    const orderedDbIds = [];
    if (pets.length === 0)
        return { clientIdToDbId: map, orderedDbIds };
    const rows = pets.map((p, i) => ({
        quote_id: quoteId,
        display_name: p.display_name?.trim() || null,
        species: p.species.trim(),
        breed: p.breed.trim(),
        size_tier: p.size_tier,
        coat_type: p.coat_type?.trim() || null,
        age_months: p.age_months ?? null,
        sex: p.sex ?? null,
        sort_order: p.sort_order ?? i,
    }));
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_quote_pets')
        .insert(rows)
        .select('id, sort_order');
    if (error || !data)
        throw new Error(error?.message || 'Erro ao inserir pets');
    const sorted = [...data].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    sorted.forEach((row, i) => {
        const original = pets[i];
        const clientId = original?.client_id?.trim();
        if (clientId)
            map.set(clientId, row.id);
        map.set(String(i), row.id);
        orderedDbIds.push(row.id);
    });
    return { clientIdToDbId: map, orderedDbIds };
}
async function replaceQuoteLines(quoteId, clinicId, lines, petsMap) {
    await supabase_1.supabaseAdmin.from('hub_quote_lines').delete().eq('quote_id', quoteId);
    if (lines.length === 0)
        return 0;
    let subtotal = 0;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        let serviceId = ln.hub_service_type_id ?? null;
        if (serviceId) {
            const { data: st } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id')
                .eq('id', serviceId)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null)
                .maybeSingle();
            if (!st)
                serviceId = null;
        }
        const resolvedLinePets = [];
        if (ln.line_pets && ln.line_pets.length > 0) {
            for (let j = 0; j < ln.line_pets.length; j++) {
                const lp = ln.line_pets[j];
                let petId = null;
                if (lp.quote_pet_id) {
                    petId = lp.quote_pet_id;
                }
                else if (lp.pet_client_id && petsMap.clientIdToDbId.has(lp.pet_client_id)) {
                    petId = petsMap.clientIdToDbId.get(lp.pet_client_id) ?? null;
                }
                else if (typeof lp.pet_index === 'number' && lp.pet_index < petsMap.orderedDbIds.length) {
                    petId = petsMap.orderedDbIds[lp.pet_index] ?? null;
                }
                if (!petId)
                    continue;
                resolvedLinePets.push({
                    quote_pet_id: petId,
                    unit_price: roundMoney2(lp.unit_price || 0),
                    applied_porte: lp.applied_porte?.trim() || null,
                    applied_coat_type: lp.applied_coat_type?.trim() || null,
                    sort_order: lp.sort_order ?? j,
                });
            }
        }
        else if (typeof ln.unit_price === 'number' && petsMap.orderedDbIds.length > 0) {
            petsMap.orderedDbIds.forEach((petId, j) => {
                resolvedLinePets.push({
                    quote_pet_id: petId,
                    unit_price: roundMoney2(ln.unit_price || 0),
                    applied_porte: null,
                    applied_coat_type: null,
                    sort_order: j,
                });
            });
        }
        const lineTotal = resolvedLinePets.length > 0
            ? computeLineTotalFromPets(resolvedLinePets)
            : roundMoney2((ln.unit_price ?? 0) * (ln.quantity ?? 1));
        subtotal += lineTotal;
        const pricing_variant = normalizeLinePricingVariant(ln.pricing_variant);
        const { data: lineRow, error: lineErr } = await supabase_1.supabaseAdmin
            .from('hub_quote_lines')
            .insert([
            {
                quote_id: quoteId,
                hub_service_type_id: serviceId,
                description: ln.description?.trim() || null,
                quantity: ln.quantity ?? 1,
                unit_price: roundMoney2(ln.unit_price ?? 0),
                discount_amount: roundMoney2(ln.discount_amount ?? 0),
                line_total: lineTotal,
                sort_order: ln.sort_order ?? i,
                pricing_variant,
            },
        ])
            .select('id')
            .single();
        if (lineErr || !lineRow)
            throw new Error(lineErr?.message || 'Erro ao inserir linha');
        const lineId = lineRow.id;
        if (resolvedLinePets.length > 0) {
            const rows = resolvedLinePets.map((rp) => ({
                line_id: lineId,
                quote_pet_id: rp.quote_pet_id,
                unit_price: rp.unit_price,
                applied_porte: rp.applied_porte,
                applied_coat_type: rp.applied_coat_type,
                sort_order: rp.sort_order,
            }));
            const { error: lpErr } = await supabase_1.supabaseAdmin.from('hub_quote_line_pets').insert(rows);
            if (lpErr)
                throw new Error(lpErr.message);
        }
    }
    return roundMoney2(subtotal);
}
const QUOTE_LIST_SELECT = `
  id, clinic_id, prospect_id, unit_id, status, notes, client_notes, total_amount, subtotal_amount,
  discount_kind, discount_value, currency, sent_at, expires_at, valid_days, public_token,
  guardian_id, converted_at, created_at, updated_at,
  billing_state, billing_waived_at, billing_waive_reason,
  prospect:hub_prospects(id, full_name, tax_id, phone, email),
  pets:hub_quote_pets(id, quote_id, display_name, species, breed, sort_order)
`;
const QUOTE_FULL_SELECT = `
  id, clinic_id, prospect_id, unit_id, status, notes, client_notes, total_amount, subtotal_amount,
  discount_kind, discount_value, currency, sent_at, expires_at, valid_days, public_token,
  guardian_id, converted_at, created_at, updated_at,
  billing_state, billing_waived_at, billing_waive_reason,
  clinic:clinics(name),
  prospect:hub_prospects(id, clinic_id, full_name, tax_id, phone, email, created_at, updated_at, deleted_at),
  pets:hub_quote_pets(id, quote_id, display_name, species, breed, size_tier, coat_type, age_months, sex, sort_order, created_at),
  lines:hub_quote_lines(id, quote_id, hub_service_type_id, description, quantity, unit_price, discount_amount, line_total, sort_order, pricing_variant, created_at,
    hub_service_types(name, service_group, description),
    line_pets:hub_quote_line_pets(id, line_id, quote_pet_id, unit_price, applied_porte, applied_coat_type, sort_order)
  )
`;
const listHubQuotes = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = parsed.data;
        await refreshExpiredQuotesForClinic(clinic_id);
        let q = supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_LIST_SELECT)
            .eq('clinic_id', clinic_id)
            .order('created_at', { ascending: false });
        const st = typeof req.query.status === 'string' ? req.query.status.trim() : '';
        if (st && ['draft', 'sent', 'awaiting_return', 'accepted', 'expired', 'cancelled'].includes(st)) {
            q = q.eq('status', st);
        }
        const { data, error } = await q;
        if (error) {
            console.error('[hub_quotes] list', error);
            return res.status(500).json({ error: 'Erro ao listar orçamentos' });
        }
        return res.json({ quotes: data ?? [] });
    }
    catch (e) {
        console.error('[hub_quotes] list', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubQuotes = listHubQuotes;
const getHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        await refreshExpiredQuotesForClinic(clinic_id);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        if (error) {
            console.error('[hub_quotes] get', error);
            return res.status(500).json({ error: 'Erro ao carregar orçamento' });
        }
        if (!data) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        return res.json({ quote: data });
    }
    catch (e) {
        console.error('[hub_quotes] get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubQuote = getHubQuote;
const createHubQuote = async (req, res) => {
    try {
        const body = createQuoteBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, prospect_id, prospect, unit_id, notes, client_notes, total_amount, discount_kind, discount_value, valid_days, expires_at, pets, lines, } = body.data;
        const draftErr = validateQuoteDraftPetsAndLines(pets, lines);
        if (draftErr) {
            return res.status(400).json({ error: draftErr });
        }
        let resolvedProspectId = prospect_id;
        if (prospect) {
            const tax = normalizeTaxId(prospect.tax_id);
            const { data: ins, error: pErr } = await supabase_1.supabaseAdmin
                .from('hub_prospects')
                .insert([
                {
                    clinic_id,
                    full_name: prospect.full_name.trim(),
                    tax_id: tax || null,
                    phone: prospect.phone.trim(),
                    email: prospect.email?.trim() || null,
                    deleted_at: null,
                },
            ])
                .select('id')
                .single();
            if (pErr || !ins) {
                console.error('[hub_quotes] create prospect', pErr);
                return res.status(500).json({ error: 'Erro ao criar contato' });
            }
            resolvedProspectId = ins.id;
        }
        if (!resolvedProspectId) {
            return res.status(400).json({ error: 'Contato inválido' });
        }
        const { data: pr, error: prErr } = await supabase_1.supabaseAdmin
            .from('hub_prospects')
            .select('id, clinic_id, deleted_at')
            .eq('id', resolvedProspectId)
            .maybeSingle();
        if (prErr || !pr || pr.clinic_id !== clinic_id || pr.deleted_at) {
            return res.status(400).json({ error: 'Contato não encontrado ou inativo' });
        }
        const quoteRow = {
            clinic_id,
            prospect_id: resolvedProspectId,
            unit_id: unit_id ?? null,
            status: 'draft',
            notes: notes?.trim() || null,
            client_notes: client_notes?.trim() || null,
            total_amount: total_amount != null ? roundMoney2(total_amount) : 0,
            subtotal_amount: 0,
            discount_kind: discount_kind ?? null,
            discount_value: discount_value != null ? roundMoney2(discount_value) : 0,
            currency: 'BRL',
            sent_at: null,
            expires_at: expires_at ?? null,
            valid_days: valid_days ?? DEFAULT_VALID_DAYS,
            public_token: null,
            guardian_id: null,
            converted_at: null,
        };
        const { data: quote, error: qErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .insert([quoteRow])
            .select('id')
            .single();
        if (qErr || !quote) {
            console.error('[hub_quotes] create quote', qErr);
            return res.status(500).json({ error: 'Erro ao criar orçamento' });
        }
        const qid = quote.id;
        try {
            const petsMap = await replaceQuotePets(qid, pets ?? []);
            if (lines && lines.length > 0) {
                const subtotal = await replaceQuoteLines(qid, clinic_id, lines, petsMap);
                const total = applyQuoteDiscount(subtotal, discount_kind ?? null, discount_value ?? 0);
                await supabase_1.supabaseAdmin
                    .from('hub_quotes')
                    .update({ subtotal_amount: subtotal, total_amount: total })
                    .eq('id', qid);
            }
            else if (total_amount != null) {
                await supabase_1.supabaseAdmin
                    .from('hub_quotes')
                    .update({ subtotal_amount: roundMoney2(total_amount), total_amount: roundMoney2(total_amount) })
                    .eq('id', qid);
            }
        }
        catch (e) {
            await supabase_1.supabaseAdmin.from('hub_quotes').delete().eq('id', qid);
            console.error('[hub_quotes] create rollback', e);
            return res.status(500).json({ error: e.message || 'Erro ao gravar linhas/pets do orçamento' });
        }
        const { data: full } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('id', qid)
            .single();
        return res.status(201).json({ quote: full });
    }
    catch (e) {
        console.error('[hub_quotes] create', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubQuote = createHubQuote;
const patchHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const body = patchQuoteBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, unit_id, notes, client_notes, total_amount, discount_kind, discount_value, valid_days, expires_at, pets, lines, } = body.data;
        const provided = unit_id !== undefined || notes !== undefined || client_notes !== undefined ||
            total_amount !== undefined || discount_kind !== undefined || discount_value !== undefined ||
            valid_days !== undefined || expires_at !== undefined ||
            pets !== undefined || lines !== undefined;
        if (!provided) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select('id, clinic_id, status, discount_kind, discount_value')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (exErr || !existing || existing.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        if (existing.status !== 'draft') {
            return res.status(409).json({ error: 'Só é possível editar orçamentos em rascunho' });
        }
        const patch = {};
        if (unit_id !== undefined)
            patch.unit_id = unit_id;
        if (notes !== undefined)
            patch.notes = notes?.trim() || null;
        if (client_notes !== undefined)
            patch.client_notes = client_notes?.trim() || null;
        if (discount_kind !== undefined)
            patch.discount_kind = discount_kind;
        if (discount_value !== undefined)
            patch.discount_value = roundMoney2(discount_value);
        if (valid_days !== undefined)
            patch.valid_days = valid_days;
        if (expires_at !== undefined)
            patch.expires_at = expires_at;
        if (Object.keys(patch).length > 0) {
            const { error: upErr } = await supabase_1.supabaseAdmin.from('hub_quotes').update(patch).eq('id', idParsed.data);
            if (upErr) {
                console.error('[hub_quotes] patch', upErr);
                return res.status(500).json({ error: 'Erro ao atualizar orçamento' });
            }
        }
        try {
            let petsMap = null;
            if (pets !== undefined && lines !== undefined) {
                const draftErr = validateQuoteDraftPetsAndLines(pets, lines);
                if (draftErr) {
                    return res.status(400).json({ error: draftErr });
                }
            }
            if (pets !== undefined) {
                petsMap = await replaceQuotePets(idParsed.data, pets);
            }
            else {
                const { data: existingPets } = await supabase_1.supabaseAdmin
                    .from('hub_quote_pets')
                    .select('id, sort_order')
                    .eq('quote_id', idParsed.data)
                    .order('sort_order', { ascending: true });
                const map = new Map();
                const ordered = [];
                (existingPets ?? []).forEach((row, i) => {
                    map.set(String(i), row.id);
                    ordered.push(row.id);
                });
                petsMap = { clientIdToDbId: map, orderedDbIds: ordered };
            }
            const effectiveDiscountKind = discount_kind !== undefined
                ? discount_kind ?? null
                : existing.discount_kind ?? null;
            const effectiveDiscountValue = discount_value !== undefined
                ? discount_value
                : Number(existing.discount_value ?? 0);
            if (lines !== undefined) {
                const subtotal = await replaceQuoteLines(idParsed.data, clinic_id, lines, petsMap);
                const total = applyQuoteDiscount(subtotal, effectiveDiscountKind, effectiveDiscountValue);
                await supabase_1.supabaseAdmin
                    .from('hub_quotes')
                    .update({ subtotal_amount: subtotal, total_amount: total })
                    .eq('id', idParsed.data);
            }
            else if (discount_kind !== undefined || discount_value !== undefined) {
                const { data: cur } = await supabase_1.supabaseAdmin
                    .from('hub_quotes')
                    .select('subtotal_amount')
                    .eq('id', idParsed.data)
                    .single();
                const subtotal = Number(cur?.subtotal_amount ?? 0);
                const total = applyQuoteDiscount(subtotal, effectiveDiscountKind, effectiveDiscountValue);
                await supabase_1.supabaseAdmin.from('hub_quotes').update({ total_amount: total }).eq('id', idParsed.data);
            }
            else if (total_amount !== undefined) {
                await supabase_1.supabaseAdmin
                    .from('hub_quotes')
                    .update({ total_amount: roundMoney2(total_amount) })
                    .eq('id', idParsed.data);
            }
        }
        catch (e) {
            console.error('[hub_quotes] patch pets/lines', e);
            return res.status(500).json({ error: e.message || 'Erro ao atualizar pets/linhas' });
        }
        await refreshExpiredQuotesForClinic(clinic_id);
        const { data: full } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('id', idParsed.data)
            .single();
        return res.json({ quote: full });
    }
    catch (e) {
        console.error('[hub_quotes] patch', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.patchHubQuote = patchHubQuote;
const deleteHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select('id, clinic_id, status')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (!existing || existing.clinic_id !== clinicParsed.data) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        if (existing.status !== 'draft') {
            return res.status(409).json({ error: 'Só é possível apagar rascunhos' });
        }
        const { error } = await supabase_1.supabaseAdmin.from('hub_quotes').delete().eq('id', idParsed.data);
        if (error) {
            console.error('[hub_quotes] delete', error);
            return res.status(500).json({ error: 'Erro ao apagar orçamento' });
        }
        return res.status(204).send();
    }
    catch (e) {
        console.error('[hub_quotes] delete', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.deleteHubQuote = deleteHubQuote;
const sendHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select('id, clinic_id, status, valid_days')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (exErr || !existing || existing.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        if (existing.status !== 'draft') {
            return res.status(409).json({ error: 'Só rascunhos podem ser enviados' });
        }
        const sentAt = new Date();
        const days = Number(existing.valid_days) || DEFAULT_VALID_DAYS;
        const expiresAt = addDaysIso(sentAt, days);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .update({
            status: 'sent',
            sent_at: sentAt.toISOString(),
            expires_at: expiresAt,
        })
            .eq('id', idParsed.data)
            .select('id, clinic_id, status, sent_at, expires_at, valid_days, total_amount, currency')
            .single();
        if (error) {
            console.error('[hub_quotes] send', error);
            return res.status(500).json({ error: 'Erro ao enviar orçamento' });
        }
        return res.json({ quote: data });
    }
    catch (e) {
        console.error('[hub_quotes] send', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.sendHubQuote = sendHubQuote;
const awaitingReturnHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select('id, clinic_id, status')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (!existing || existing.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        if (existing.status !== 'sent') {
            return res.status(409).json({ error: 'Só orçamentos enviados podem ficar aguardando retorno' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .update({ status: 'awaiting_return' })
            .eq('id', idParsed.data)
            .select('id, status')
            .single();
        if (error) {
            console.error('[hub_quotes] awaiting-return', error);
            return res.status(500).json({ error: 'Erro ao atualizar status' });
        }
        return res.json({ quote: data });
    }
    catch (e) {
        console.error('[hub_quotes] awaiting-return', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.awaitingReturnHubQuote = awaitingReturnHubQuote;
const cancelHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select('id, clinic_id, status')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (!existing || existing.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        if (existing.status === 'accepted' || existing.status === 'cancelled') {
            return res.status(409).json({ error: 'Estado atual não permite cancelar' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .update({ status: 'cancelled' })
            .eq('id', idParsed.data)
            .select('id, clinic_id, status')
            .single();
        if (error) {
            console.error('[hub_quotes] cancel', error);
            return res.status(500).json({ error: 'Erro ao cancelar' });
        }
        return res.json({ quote: data });
    }
    catch (e) {
        console.error('[hub_quotes] cancel', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.cancelHubQuote = cancelHubQuote;
const duplicateHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        const { data: source } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        if (!source) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        const newQuoteRow = {
            clinic_id,
            prospect_id: source.prospect_id,
            unit_id: source.unit_id ?? null,
            status: 'draft',
            notes: source.notes ?? null,
            client_notes: source.client_notes ?? null,
            total_amount: Number(source.total_amount ?? 0),
            subtotal_amount: Number(source.subtotal_amount ?? 0),
            discount_kind: source.discount_kind ?? null,
            discount_value: Number(source.discount_value ?? 0),
            currency: 'BRL',
            sent_at: null,
            expires_at: null,
            valid_days: source.valid_days ?? DEFAULT_VALID_DAYS,
            public_token: null,
            guardian_id: null,
            converted_at: null,
        };
        const { data: created, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .insert([newQuoteRow])
            .select('id')
            .single();
        if (cErr || !created) {
            console.error('[hub_quotes] duplicate insert', cErr);
            return res.status(500).json({ error: 'Erro ao duplicar orçamento' });
        }
        const newId = created.id;
        const sourcePets = source.pets ?? [];
        const sourceLines = source.lines ?? [];
        const oldToNewPetId = new Map();
        if (sourcePets.length > 0) {
            const rows = sourcePets.map((p, i) => ({
                quote_id: newId,
                display_name: p.display_name,
                species: p.species,
                breed: p.breed,
                size_tier: p.size_tier,
                coat_type: p.coat_type,
                age_months: p.age_months,
                sex: p.sex,
                sort_order: p.sort_order ?? i,
            }));
            const { data: inserted, error: piErr } = await supabase_1.supabaseAdmin
                .from('hub_quote_pets')
                .insert(rows)
                .select('id, sort_order');
            if (piErr) {
                await supabase_1.supabaseAdmin.from('hub_quotes').delete().eq('id', newId);
                return res.status(500).json({ error: 'Erro ao duplicar pets' });
            }
            const sortedSource = [...sourcePets].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const sortedInserted = [...(inserted ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            sortedSource.forEach((p, i) => {
                const newRow = sortedInserted[i];
                if (newRow)
                    oldToNewPetId.set(p.id, newRow.id);
            });
        }
        for (let i = 0; i < sourceLines.length; i++) {
            const ln = sourceLines[i];
            const { data: lineRow, error: lErr } = await supabase_1.supabaseAdmin
                .from('hub_quote_lines')
                .insert([
                {
                    quote_id: newId,
                    hub_service_type_id: ln.hub_service_type_id,
                    description: ln.description,
                    quantity: ln.quantity,
                    unit_price: ln.unit_price,
                    discount_amount: ln.discount_amount,
                    line_total: ln.line_total,
                    sort_order: ln.sort_order ?? i,
                    pricing_variant: normalizeLinePricingVariant(ln.pricing_variant),
                },
            ])
                .select('id')
                .single();
            if (lErr || !lineRow) {
                await supabase_1.supabaseAdmin.from('hub_quotes').delete().eq('id', newId);
                return res.status(500).json({ error: 'Erro ao duplicar linhas' });
            }
            const lpRows = (ln.line_pets ?? [])
                .map((lp) => ({
                line_id: lineRow.id,
                quote_pet_id: oldToNewPetId.get(lp.quote_pet_id) ?? null,
                unit_price: lp.unit_price,
                applied_porte: lp.applied_porte,
                applied_coat_type: lp.applied_coat_type,
                sort_order: lp.sort_order,
            }))
                .filter((r) => r.quote_pet_id);
            if (lpRows.length > 0) {
                const { error: lpErr } = await supabase_1.supabaseAdmin.from('hub_quote_line_pets').insert(lpRows);
                if (lpErr) {
                    await supabase_1.supabaseAdmin.from('hub_quotes').delete().eq('id', newId);
                    return res.status(500).json({ error: 'Erro ao duplicar valores por pet' });
                }
            }
        }
        const { data: full } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('id', newId)
            .single();
        return res.status(201).json({ quote: full });
    }
    catch (e) {
        console.error('[hub_quotes] duplicate', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.duplicateHubQuote = duplicateHubQuote;
/**
 * Volta o orçamento a rascunho para permitir edição completa (PATCH só aceita `draft`).
 * Limpa envio, validade e link público; será preciso gerar novo link e reenviar após alterações.
 */
const reopenHubQuoteAsDraft = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select('id, clinic_id, status')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (exErr || !existing || existing.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        const st = String(existing.status || '');
        if (st === 'draft') {
            return res.status(409).json({ error: 'Este orçamento já é um rascunho' });
        }
        if (st === 'accepted') {
            return res.status(409).json({
                error: 'Orçamentos já aprovados não podem ser reabertos para edição. Use «Duplicar» para criar uma nova proposta.',
            });
        }
        const allowed = ['sent', 'awaiting_return', 'expired', 'cancelled'];
        if (!allowed.includes(st)) {
            return res.status(409).json({ error: 'Estado atual não permite reabrir para edição' });
        }
        const { error: upErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .update({
            status: 'draft',
            sent_at: null,
            expires_at: null,
            public_token: null,
            billing_state: 'none',
            billing_waived_at: null,
            billing_waive_reason: null,
        })
            .eq('id', idParsed.data);
        if (upErr) {
            console.error('[hub_quotes] reopen-draft', upErr);
            return res.status(500).json({ error: 'Erro ao reabrir orçamento' });
        }
        await refreshExpiredQuotesForClinic(clinic_id);
        const { data: full, error: fullErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('id', idParsed.data)
            .single();
        if (fullErr || !full) {
            return res.status(500).json({ error: 'Erro ao carregar orçamento atualizado' });
        }
        return res.json({ quote: full });
    }
    catch (e) {
        console.error('[hub_quotes] reopen-draft', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.reopenHubQuoteAsDraft = reopenHubQuoteAsDraft;
const ensurePublicToken = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select('id, clinic_id, public_token')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (!existing || existing.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        let token = existing.public_token;
        if (!token) {
            token = (0, node_crypto_1.randomBytes)(24).toString('base64url');
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ public_token: token })
                .eq('id', idParsed.data);
            if (error) {
                console.error('[hub_quotes] public-token', error);
                return res.status(500).json({ error: 'Erro ao gerar token público' });
            }
        }
        return res.json({ public_token: token });
    }
    catch (e) {
        console.error('[hub_quotes] public-token', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.ensurePublicToken = ensurePublicToken;
const getPublicQuote = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!token) {
            return res.status(400).json({ error: 'Token inválido' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('public_token', token)
            .maybeSingle();
        if (error) {
            console.error('[hub_quotes] public get', error);
            return res.status(500).json({ error: 'Erro ao carregar orçamento' });
        }
        if (!data) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        return res.json({ quote: data });
    }
    catch (e) {
        console.error('[hub_quotes] public get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getPublicQuote = getPublicQuote;
const getHubQuotePdf = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(QUOTE_FULL_SELECT)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinicParsed.data)
            .maybeSingle();
        if (error || !data) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        (0, hubQuotePdf_1.streamQuotePdf)(res, data);
        return;
    }
    catch (e) {
        console.error('[hub_quotes] pdf', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubQuotePdf = getHubQuotePdf;
const suggestQuotePrice = async (req, res) => {
    try {
        const body = suggestPriceBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, hub_service_type_id, pet, pricing_variant: pricingVariantBody } = body.data;
        const { data: st } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, service_group, pricing_matrix, cost_amount, sale_amount, default_duration_minutes')
            .eq('id', hub_service_type_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!st) {
            return res.status(404).json({ error: 'Tipo de serviço não encontrado' });
        }
        const { data: cs } = await supabase_1.supabaseAdmin
            .from('hub_clinic_settings')
            .select('pet_puppy_max_months')
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        const puppyMaxMonths = Number(cs?.pet_puppy_max_months ?? 8);
        const today = new Date().toISOString().slice(0, 10);
        const petFields = {
            size_tier: pet.size_tier,
            birth_date: pet.birth_date ?? null,
            coat_type: pet.coat_type ?? null,
        };
        const pricing_variant = normalizeLinePricingVariant(pricingVariantBody);
        try {
            const resolved = (0, hubPricingResolve_1.resolveServiceLinePricing)({
                serviceType: {
                    id: st.id,
                    service_group: st.service_group,
                    pricing_matrix: st.pricing_matrix,
                    cost_amount: Number(st.cost_amount ?? 0),
                    sale_amount: Number(st.sale_amount ?? 0),
                },
                pet: petFields,
                appointmentDateYmd: today,
                puppyMaxMonths,
                overrideTier: null,
                overrideCoatType: null,
                pricing_variant,
            });
            return res.json({
                unit_price: resolved.sale,
                cost: resolved.cost,
                applied_porte: resolved.porteTierApplied,
                applied_coat_type: resolved.coatTypeApplied,
                pricing_variant: resolved.pricing_variant,
                default_duration_minutes: st.default_duration_minutes ?? null,
            });
        }
        catch (priceErr) {
            return res.json({
                unit_price: Number(st.sale_amount ?? 0),
                cost: Number(st.cost_amount ?? 0),
                applied_porte: null,
                applied_coat_type: null,
                default_duration_minutes: st.default_duration_minutes ?? null,
                warning: priceErr.message,
            });
        }
    }
    catch (e) {
        console.error('[hub_quotes] suggest', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.suggestQuotePrice = suggestQuotePrice;
const convertHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const body = convertQuoteBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, link_to_guardian_id, guardian } = body.data;
        const { data: quote, error: qErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(`
        id, clinic_id, prospect_id, status,
        prospect:hub_prospects(id, full_name, tax_id, phone, email, deleted_at),
        pets:hub_quote_pets(id, display_name, species, breed, size_tier, coat_type, age_months, sex)
      `)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        if (qErr || !quote) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        const st = quote.status;
        if (st === 'accepted') {
            return res.status(409).json({ error: 'Orçamento já convertido' });
        }
        if (st === 'cancelled' || st === 'expired' || st === 'draft') {
            return res.status(409).json({
                error: st === 'draft'
                    ? 'Envie o orçamento antes de converter em cliente'
                    : 'Orçamento não pode ser convertido neste estado',
            });
        }
        if (st !== 'sent' && st !== 'awaiting_return') {
            return res.status(409).json({ error: 'Só é possível converter orçamentos enviados ou aguardando retorno' });
        }
        const rawProspect = quote.prospect;
        const prospect = (Array.isArray(rawProspect) ? rawProspect[0] : rawProspect);
        if (prospect.deleted_at) {
            return res.status(400).json({ error: 'Contato associado está inativo' });
        }
        const taxNorm = normalizeTaxId(prospect.tax_id);
        let guardianId = link_to_guardian_id;
        if (guardianId) {
            const ok = await supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id')
                .eq('id', guardianId)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (!ok.data) {
                return res.status(400).json({ error: 'Tutor indicado inválido' });
            }
        }
        else {
            if (taxNorm) {
                const { data: dups } = await supabase_1.supabaseAdmin
                    .from('hub_guardians')
                    .select('id, full_name, tax_id')
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null);
                const matches = dups?.filter((g) => {
                    const t = g.tax_id ? normalizeTaxId(String(g.tax_id)) : '';
                    return t && t === taxNorm;
                }) ?? [];
                if (matches.length > 0) {
                    const names = matches.map((m) => m.full_name).join(', ');
                    return res.status(409).json({
                        error: `Já existe tutor com este CPF (${names}). Indique link_to_guardian_id para associar ao existente.`,
                        duplicate_guardians: matches.map((m) => ({ id: m.id, full_name: m.full_name })),
                    });
                }
            }
            const gName = guardian?.full_name?.trim() || prospect.full_name;
            const gNotes = guardian?.notes?.trim() ||
                `Convertido de orçamento ${idParsed.data.slice(0, 8)}… (prospect ${prospect.id.slice(0, 8)})`;
            const { data: gRow, error: gErr } = await supabase_1.supabaseAdmin
                .from('hub_guardians')
                .insert([
                {
                    clinic_id,
                    full_name: gName,
                    phone: prospect.phone,
                    email: prospect.email,
                    tax_id: taxNorm || null,
                    notes: gNotes,
                    deleted_at: null,
                },
            ])
                .select('id')
                .single();
            if (gErr || !gRow) {
                console.error('[hub_quotes] convert guardian', gErr);
                return res.status(500).json({ error: 'Erro ao criar tutor' });
            }
            guardianId = gRow.id;
        }
        const rawPets = quote.pets;
        const pets = (Array.isArray(rawPets) ? rawPets : []);
        if (!pets || pets.length === 0) {
            return res.status(400).json({ error: 'Orçamento sem pets para converter' });
        }
        for (const p of pets) {
            const petName = (p.display_name && p.display_name.trim()) || 'Pet';
            const { data: pet, error: petErr } = await supabase_1.supabaseAdmin
                .from('hub_pets')
                .insert([
                {
                    clinic_id,
                    name: petName,
                    species: p.species.trim(),
                    breed: p.breed.trim(),
                    sex: p.sex,
                    birth_date: null,
                    notes: null,
                    size_tier: p.size_tier,
                    coat_color: null,
                    coat_type: p.coat_type,
                    deleted_at: null,
                },
            ])
                .select('id')
                .single();
            if (petErr || !pet) {
                console.error('[hub_quotes] convert pet', petErr);
                return res.status(500).json({ error: 'Erro ao criar pet' });
            }
            const { error: linkErr } = await supabase_1.supabaseAdmin.from('hub_pet_guardians').insert([
                { pet_id: pet.id, guardian_id: guardianId, role: 'primary' },
            ]);
            if (linkErr) {
                console.error('[hub_quotes] convert link', linkErr);
                await supabase_1.supabaseAdmin.from('hub_pets').delete().eq('id', pet.id);
                return res.status(500).json({ error: 'Erro ao associar pet ao tutor' });
            }
        }
        const now = new Date().toISOString();
        const { data: updated, error: finErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .update({
            status: 'accepted',
            guardian_id: guardianId,
            converted_at: now,
            billing_state: 'awaiting_billing',
        })
            .eq('id', idParsed.data)
            .select('id, status, guardian_id, converted_at, billing_state')
            .single();
        if (finErr) {
            console.error('[hub_quotes] convert finalize', finErr);
            return res.status(500).json({ error: 'Erro ao finalizar conversão' });
        }
        return res.json({ quote: updated, guardian_id: guardianId });
    }
    catch (e) {
        console.error('[hub_quotes] convert', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.convertHubQuote = convertHubQuote;
/** Fecha orçamento após tutor + pets criados manualmente (wizard); valida vínculos pet ↔ tutor. */
const finalizeManualConversionHubQuote = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const body = finalizeManualConversionBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, guardian_id, manual_pet_links } = body.data;
        const { data: quote, error: qErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(`
        id, clinic_id, prospect_id, status,
        prospect:hub_prospects(id, deleted_at),
        pets:hub_quote_pets(id, sort_order)
      `)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        if (qErr || !quote) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        const st = quote.status;
        if (st === 'accepted') {
            return res.status(409).json({ error: 'Orçamento já convertido' });
        }
        if (st === 'cancelled' || st === 'expired' || st === 'draft') {
            return res.status(409).json({
                error: st === 'draft'
                    ? 'Envie o orçamento antes de finalizar a conversão'
                    : 'Orçamento não pode ser finalizado neste estado',
            });
        }
        if (st !== 'sent' && st !== 'awaiting_return') {
            return res.status(409).json({ error: 'Só é possível finalizar orçamentos enviados ou aguardando retorno' });
        }
        const rawProspect = quote.prospect;
        const prospect = (Array.isArray(rawProspect) ? rawProspect[0] : rawProspect);
        if (prospect?.deleted_at) {
            return res.status(400).json({ error: 'Contato associado está inativo' });
        }
        const { data: guardianRow, error: gErr } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id')
            .eq('id', guardian_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (gErr || !guardianRow) {
            return res.status(400).json({ error: 'Tutor inválido ou não pertence à clínica' });
        }
        const rawPets = quote.pets;
        const quotePets = (Array.isArray(rawPets) ? rawPets : []);
        const orderedQuotePetIds = [...quotePets].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((p) => p.id);
        if (orderedQuotePetIds.length === 0) {
            return res.status(400).json({ error: 'Orçamento sem pets para finalizar' });
        }
        if (manual_pet_links.length !== orderedQuotePetIds.length) {
            return res.status(400).json({
                error: `Número de pets não coincide com o orçamento (esperado ${orderedQuotePetIds.length}, recebido ${manual_pet_links.length}).`,
            });
        }
        const linkByQuotePet = new Map(manual_pet_links.map((l) => [l.quote_pet_id, l.hub_pet_id]));
        const seenHubPet = new Set();
        for (const qpid of orderedQuotePetIds) {
            if (!linkByQuotePet.has(qpid)) {
                return res.status(400).json({ error: `Falta ligação para o pet do orçamento (${qpid.slice(0, 8)}…).` });
            }
            const hid = linkByQuotePet.get(qpid);
            if (seenHubPet.has(hid)) {
                return res.status(400).json({ error: 'O mesmo pet da clínica foi indicado mais de uma vez.' });
            }
            seenHubPet.add(hid);
        }
        for (const l of manual_pet_links) {
            if (!orderedQuotePetIds.includes(l.quote_pet_id)) {
                return res.status(400).json({ error: 'quote_pet_id não pertence a este orçamento.' });
            }
        }
        for (const qpid of orderedQuotePetIds) {
            const hubPetId = linkByQuotePet.get(qpid);
            const { data: petRow, error: petErr } = await supabase_1.supabaseAdmin
                .from('hub_pets')
                .select('id, clinic_id, deleted_at')
                .eq('id', hubPetId)
                .maybeSingle();
            if (petErr || !petRow || petRow.clinic_id !== clinic_id) {
                return res.status(400).json({ error: 'Pet da clínica inválido ou inexistente.' });
            }
            if (petRow.deleted_at) {
                return res.status(400).json({ error: 'Um dos pets indicados está inativo.' });
            }
            const { data: bond, error: bondErr } = await supabase_1.supabaseAdmin
                .from('hub_pet_guardians')
                .select('pet_id')
                .eq('pet_id', hubPetId)
                .eq('guardian_id', guardian_id)
                .eq('role', 'primary')
                .maybeSingle();
            if (bondErr || !bond) {
                return res.status(400).json({
                    error: 'Cada pet deve estar associado ao tutor como responsável principal.',
                });
            }
        }
        const now = new Date().toISOString();
        const { data: updated, error: finErr } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .update({
            status: 'accepted',
            guardian_id,
            converted_at: now,
            billing_state: 'awaiting_billing',
        })
            .eq('id', idParsed.data)
            .select('id, status, guardian_id, converted_at, billing_state')
            .single();
        if (finErr) {
            console.error('[hub_quotes] finalize manual', finErr);
            return res.status(500).json({ error: 'Erro ao finalizar conversão' });
        }
        return res.json({ quote: updated, guardian_id });
    }
    catch (e) {
        console.error('[hub_quotes] finalize manual', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.finalizeManualConversionHubQuote = finalizeManualConversionHubQuote;
