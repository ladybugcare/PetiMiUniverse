"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveHubSpecialPrice = exports.patchHubSpecialPrice = exports.createHubSpecialPrice = exports.resolveHubSpecialPrice = exports.listHubSpecialPrices = void 0;
exports.upsertSpecialPriceFromAppointment = upsertSpecialPriceFromAppointment;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
const hubSpecialPrices_1 = require("./hubSpecialPrices");
const uuidStr = zod_1.z.string().uuid();
const money = zod_1.z.number().finite().min(0).max(99999999.99);
const scopeSchema = zod_1.z.enum(['pet', 'guardian', 'family_plan']);
async function fetchCatalogSale(clinicId, serviceTypeId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('sale_amount')
        .eq('id', serviceTypeId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (!data)
        return null;
    return (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(data.sale_amount) || 0);
}
async function assertPetInClinic(clinicId, petId) {
    const { data: pet } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('id, clinic_id')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (!pet)
        return { ok: false, error: 'Pet não encontrado nesta clínica' };
    const { data: link } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('guardian_id')
        .eq('pet_id', petId)
        .eq('role', 'primary')
        .limit(1)
        .maybeSingle();
    const guardian_id = link?.guardian_id ?? null;
    if (!guardian_id) {
        const { data: anyLink } = await supabase_1.supabaseAdmin
            .from('hub_pet_guardians')
            .select('guardian_id')
            .eq('pet_id', petId)
            .limit(1)
            .maybeSingle();
        return { ok: true, guardian_id: anyLink?.guardian_id ?? null };
    }
    return { ok: true, guardian_id };
}
async function assertGuardianInClinic(clinicId, guardianId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_guardians')
        .select('id')
        .eq('id', guardianId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return Boolean(data);
}
async function canAutoApprove(userId, clinicId) {
    return (0, authMiddleware_1.checkPermission)(userId, clinicId, 'hub.financial.write');
}
async function enrichRows(rows) {
    const familyIds = rows.filter((r) => r.scope === 'family_plan').map((r) => r.id);
    const members = await (0, hubSpecialPrices_1.loadMemberPetIds)(familyIds);
    return rows.map((r) => (0, hubSpecialPrices_1.mapSpecialPriceRow)(r, members.get(r.id)));
}
const listHubSpecialPrices = async (req, res) => {
    try {
        const q = zod_1.z
            .object({
            clinic_id: uuidStr,
            pet_id: uuidStr.optional(),
            guardian_id: uuidStr.optional(),
            hub_service_type_id: uuidStr.optional(),
            status: zod_1.z.enum(['pending_approval', 'active', 'inactive', 'all']).optional(),
            needs_catalog_review: zod_1.z.enum(['true', 'false']).optional(),
        })
            .safeParse(req.query);
        if (!q.success)
            return res.status(400).json({ error: 'Parâmetros inválidos' });
        const { clinic_id, pet_id, guardian_id, hub_service_type_id, status, needs_catalog_review } = q.data;
        let query = supabase_1.supabaseAdmin.from('hub_special_prices').select('*').eq('clinic_id', clinic_id);
        if (status && status !== 'all')
            query = query.eq('status', status);
        else if (!status)
            query = query.in('status', ['pending_approval', 'active']);
        if (pet_id) {
            // Inclui acordos do pet + planos família em que o pet é membro + tutor (via pet)
            const { data: memberships } = await supabase_1.supabaseAdmin
                .from('hub_special_price_pets')
                .select('special_price_id')
                .eq('pet_id', pet_id);
            const familyIds = (memberships ?? []).map((m) => m.special_price_id);
            const petAssert = await assertPetInClinic(clinic_id, pet_id);
            const gId = petAssert.ok ? petAssert.guardian_id : null;
            const orParts = [`pet_id.eq.${pet_id}`];
            if (familyIds.length)
                orParts.push(`id.in.(${familyIds.join(',')})`);
            if (gId)
                orParts.push(`and(scope.eq.guardian,guardian_id.eq.${gId})`);
            query = query.or(orParts.join(','));
        }
        else if (guardian_id) {
            query = query.eq('guardian_id', guardian_id);
        }
        if (hub_service_type_id)
            query = query.eq('hub_service_type_id', hub_service_type_id);
        if (needs_catalog_review === 'true')
            query = query.eq('needs_catalog_review', true);
        const { data, error } = await query.order('updated_at', { ascending: false }).limit(200);
        if (error) {
            console.error('[hub_special_prices] list', error);
            return res.status(500).json({ error: 'Erro ao listar preços especiais' });
        }
        const special_prices = await enrichRows(data ?? []);
        return res.json({ special_prices });
    }
    catch (e) {
        console.error('[hub_special_prices] list', e);
        return res.status(500).json({ error: 'Erro ao listar preços especiais' });
    }
};
exports.listHubSpecialPrices = listHubSpecialPrices;
const resolveHubSpecialPrice = async (req, res) => {
    try {
        const q = zod_1.z
            .object({
            clinic_id: uuidStr,
            pet_id: uuidStr.optional(),
            guardian_id: uuidStr.optional(),
            hub_service_type_id: uuidStr,
            on_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
            .safeParse(req.query);
        if (!q.success)
            return res.status(400).json({ error: 'Parâmetros inválidos' });
        let guardianId = q.data.guardian_id ?? null;
        if (!guardianId && q.data.pet_id) {
            const petAssert = await assertPetInClinic(q.data.clinic_id, q.data.pet_id);
            if (petAssert.ok)
                guardianId = petAssert.guardian_id;
        }
        const catalogSale = await fetchCatalogSale(q.data.clinic_id, q.data.hub_service_type_id);
        const resolved = await (0, hubSpecialPrices_1.resolveActiveSpecialPrice)({
            clinicId: q.data.clinic_id,
            petId: q.data.pet_id ?? null,
            guardianId,
            hubServiceTypeId: q.data.hub_service_type_id,
            onDateYmd: q.data.on_date,
            catalogSale,
        });
        return res.json({
            catalog_sale: catalogSale,
            special_price: resolved,
        });
    }
    catch (e) {
        console.error('[hub_special_prices] resolve', e);
        return res.status(500).json({ error: 'Erro ao resolver preço especial' });
    }
};
exports.resolveHubSpecialPrice = resolveHubSpecialPrice;
const createBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    scope: scopeSchema,
    guardian_id: uuidStr.optional().nullable(),
    pet_id: uuidStr.optional().nullable(),
    hub_service_type_id: uuidStr,
    sale_amount: money,
    cost_amount: money.optional().nullable(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    auto_track_catalog: zod_1.z.boolean().optional(),
    valid_from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    valid_until: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    member_pet_ids: zod_1.z.array(uuidStr).min(2).max(30).optional(),
    /** Se true e o usuário não tem financial.write, força pending (default). */
    force_pending: zod_1.z.boolean().optional(),
})
    .strict();
const createHubSpecialPrice = async (req, res) => {
    try {
        const body = createBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const b = body.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const catalogSale = await fetchCatalogSale(b.clinic_id, b.hub_service_type_id);
        if (catalogSale == null) {
            return res.status(400).json({ error: 'Tipo de serviço não encontrado' });
        }
        let guardianId = b.guardian_id ?? null;
        let petId = b.pet_id ?? null;
        if (b.scope === 'pet') {
            if (!petId)
                return res.status(400).json({ error: 'pet_id é obrigatório para scope=pet' });
            const petAssert = await assertPetInClinic(b.clinic_id, petId);
            if (!petAssert.ok)
                return res.status(400).json({ error: petAssert.error });
            guardianId = guardianId ?? petAssert.guardian_id;
            if (!guardianId)
                return res.status(400).json({ error: 'Pet sem tutor vinculado' });
        }
        else if (b.scope === 'guardian') {
            if (!guardianId)
                return res.status(400).json({ error: 'guardian_id é obrigatório para scope=guardian' });
            if (!(await assertGuardianInClinic(b.clinic_id, guardianId))) {
                return res.status(400).json({ error: 'Tutor não encontrado nesta clínica' });
            }
            petId = null;
        }
        else {
            if (!guardianId)
                return res.status(400).json({ error: 'guardian_id é obrigatório para plano família' });
            if (!(await assertGuardianInClinic(b.clinic_id, guardianId))) {
                return res.status(400).json({ error: 'Tutor não encontrado nesta clínica' });
            }
            petId = null;
            if (!b.member_pet_ids || b.member_pet_ids.length < 2) {
                return res.status(400).json({ error: 'Plano família exige pelo menos 2 pets em member_pet_ids' });
            }
            for (const mid of b.member_pet_ids) {
                const pa = await assertPetInClinic(b.clinic_id, mid);
                if (!pa.ok)
                    return res.status(400).json({ error: `Pet inválido no plano: ${mid}` });
            }
        }
        const autoApprove = !b.force_pending && (await canAutoApprove(userId, b.clinic_id));
        const status = autoApprove ? 'active' : 'pending_approval';
        // Desativa acordo ativo conflitante do mesmo escopo (substituição).
        if (status === 'active') {
            await deactivateConflicting({
                clinicId: b.clinic_id,
                scope: b.scope,
                petId,
                guardianId,
                hubServiceTypeId: b.hub_service_type_id,
            });
        }
        const insert = {
            clinic_id: b.clinic_id,
            scope: b.scope,
            guardian_id: guardianId,
            pet_id: petId,
            hub_service_type_id: b.hub_service_type_id,
            sale_amount: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(b.sale_amount),
            cost_amount: b.cost_amount == null ? null : (0, hubServiceTypesPricingMatrix_1.roundMoney2)(b.cost_amount),
            notes: b.notes?.trim() || null,
            status,
            created_by: userId,
            approved_by: autoApprove ? userId : null,
            approved_at: autoApprove ? new Date().toISOString() : null,
            catalog_sale_at_set: catalogSale,
            auto_track_catalog: Boolean(b.auto_track_catalog),
            needs_catalog_review: false,
            valid_from: b.valid_from ?? null,
            valid_until: b.valid_until ?? null,
        };
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_special_prices')
            .insert(insert)
            .select('*')
            .single();
        if (error || !data) {
            console.error('[hub_special_prices] create', error);
            if (String(error?.message || '').includes('uniq_hub_special_prices')) {
                return res.status(409).json({
                    error: 'Já existe um preço especial ativo para este escopo e serviço. Desative o atual ou aprove a substituição.',
                });
            }
            return res.status(500).json({ error: 'Erro ao criar preço especial' });
        }
        if (b.scope === 'family_plan' && b.member_pet_ids) {
            const rows = b.member_pet_ids.map((pid) => ({
                special_price_id: data.id,
                pet_id: pid,
            }));
            const { error: me } = await supabase_1.supabaseAdmin.from('hub_special_price_pets').insert(rows);
            if (me) {
                console.error('[hub_special_prices] members', me);
                await supabase_1.supabaseAdmin.from('hub_special_prices').delete().eq('id', data.id);
                return res.status(500).json({ error: 'Erro ao vincular pets ao plano família' });
            }
        }
        const [enriched] = await enrichRows([data]);
        return res.status(201).json({
            special_price: enriched,
            auto_approved: autoApprove,
        });
    }
    catch (e) {
        console.error('[hub_special_prices] create', e);
        return res.status(500).json({ error: 'Erro ao criar preço especial' });
    }
};
exports.createHubSpecialPrice = createHubSpecialPrice;
async function deactivateConflicting(input) {
    let q = supabase_1.supabaseAdmin
        .from('hub_special_prices')
        .update({ status: 'inactive' })
        .eq('clinic_id', input.clinicId)
        .eq('scope', input.scope)
        .eq('hub_service_type_id', input.hubServiceTypeId)
        .eq('status', 'active');
    if (input.scope === 'pet' && input.petId)
        q = q.eq('pet_id', input.petId);
    if ((input.scope === 'guardian' || input.scope === 'family_plan') && input.guardianId) {
        q = q.eq('guardian_id', input.guardianId);
    }
    if (input.exceptId)
        q = q.neq('id', input.exceptId);
    await q;
}
const patchBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    sale_amount: money.optional(),
    cost_amount: money.nullable().optional(),
    notes: zod_1.z.string().trim().max(2000).nullable().optional(),
    auto_track_catalog: zod_1.z.boolean().optional(),
    valid_from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    valid_until: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    member_pet_ids: zod_1.z.array(uuidStr).min(2).max(30).optional(),
    status: zod_1.z.enum(['active', 'inactive']).optional(),
    clear_catalog_review: zod_1.z.boolean().optional(),
})
    .strict();
const patchHubSpecialPrice = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = patchBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const b = body.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const { data: existing, error: fe } = await supabase_1.supabaseAdmin
            .from('hub_special_prices')
            .select('*')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (fe || !existing)
            return res.status(404).json({ error: 'Preço especial não encontrado' });
        const row = existing;
        if (row.clinic_id !== b.clinic_id) {
            return res.status(403).json({ error: 'Preço especial não pertence a esta clínica' });
        }
        const changingMoney = b.sale_amount !== undefined ||
            b.cost_amount !== undefined ||
            b.member_pet_ids !== undefined;
        const reactivating = b.status === 'active' && row.status !== 'active';
        // Alterar valor ou reativar exige financial.write; senão volta a pending.
        let nextStatus = b.status ?? row.status;
        if (changingMoney && row.status === 'active') {
            const auto = await canAutoApprove(userId, b.clinic_id);
            if (!auto)
                nextStatus = 'pending_approval';
        }
        if (reactivating) {
            const auto = await canAutoApprove(userId, b.clinic_id);
            if (!auto)
                return res.status(403).json({ error: 'Apenas CADMIN ou financeiro podem reativar preços especiais' });
            await deactivateConflicting({
                clinicId: b.clinic_id,
                scope: row.scope,
                petId: row.pet_id,
                guardianId: row.guardian_id,
                hubServiceTypeId: row.hub_service_type_id,
                exceptId: row.id,
            });
        }
        const patch = {};
        if (b.sale_amount !== undefined)
            patch.sale_amount = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(b.sale_amount);
        if (b.cost_amount !== undefined) {
            patch.cost_amount = b.cost_amount == null ? null : (0, hubServiceTypesPricingMatrix_1.roundMoney2)(b.cost_amount);
        }
        if (b.notes !== undefined)
            patch.notes = b.notes?.trim() || null;
        if (b.auto_track_catalog !== undefined)
            patch.auto_track_catalog = b.auto_track_catalog;
        if (b.valid_from !== undefined)
            patch.valid_from = b.valid_from;
        if (b.valid_until !== undefined)
            patch.valid_until = b.valid_until;
        if (b.clear_catalog_review || b.sale_amount !== undefined) {
            patch.needs_catalog_review = false;
            if (b.sale_amount !== undefined) {
                const catalogSale = await fetchCatalogSale(b.clinic_id, row.hub_service_type_id);
                if (catalogSale != null)
                    patch.catalog_sale_at_set = catalogSale;
            }
        }
        if (nextStatus !== row.status) {
            patch.status = nextStatus;
            if (nextStatus === 'active') {
                patch.approved_by = userId;
                patch.approved_at = new Date().toISOString();
            }
        }
        if (Object.keys(patch).length === 0 && !b.member_pet_ids) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        if (Object.keys(patch).length > 0) {
            const { error: ue } = await supabase_1.supabaseAdmin
                .from('hub_special_prices')
                .update(patch)
                .eq('id', row.id);
            if (ue) {
                console.error('[hub_special_prices] patch', ue);
                return res.status(500).json({ error: 'Erro ao atualizar preço especial' });
            }
        }
        if (b.member_pet_ids && row.scope === 'family_plan') {
            for (const mid of b.member_pet_ids) {
                const pa = await assertPetInClinic(b.clinic_id, mid);
                if (!pa.ok)
                    return res.status(400).json({ error: `Pet inválido no plano: ${mid}` });
            }
            await supabase_1.supabaseAdmin.from('hub_special_price_pets').delete().eq('special_price_id', row.id);
            await supabase_1.supabaseAdmin.from('hub_special_price_pets').insert(b.member_pet_ids.map((pid) => ({ special_price_id: row.id, pet_id: pid })));
        }
        const { data: updated } = await supabase_1.supabaseAdmin
            .from('hub_special_prices')
            .select('*')
            .eq('id', row.id)
            .single();
        const [enriched] = await enrichRows([updated]);
        return res.json({ special_price: enriched });
    }
    catch (e) {
        console.error('[hub_special_prices] patch', e);
        return res.status(500).json({ error: 'Erro ao atualizar preço especial' });
    }
};
exports.patchHubSpecialPrice = patchHubSpecialPrice;
const approveHubSpecialPrice = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = zod_1.z.object({ clinic_id: uuidStr }).safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_special_prices')
            .select('*')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (!existing)
            return res.status(404).json({ error: 'Preço especial não encontrado' });
        const row = existing;
        if (row.clinic_id !== body.data.clinic_id) {
            return res.status(403).json({ error: 'Preço especial não pertence a esta clínica' });
        }
        if (row.status === 'active') {
            const [enriched] = await enrichRows([row]);
            return res.json({ special_price: enriched, already_active: true });
        }
        if (row.status === 'inactive') {
            return res.status(400).json({ error: 'Reative o preço especial antes de aprovar' });
        }
        await deactivateConflicting({
            clinicId: row.clinic_id,
            scope: row.scope,
            petId: row.pet_id,
            guardianId: row.guardian_id,
            hubServiceTypeId: row.hub_service_type_id,
            exceptId: row.id,
        });
        const { data: updated, error } = await supabase_1.supabaseAdmin
            .from('hub_special_prices')
            .update({
            status: 'active',
            approved_by: userId,
            approved_at: new Date().toISOString(),
        })
            .eq('id', row.id)
            .select('*')
            .single();
        if (error || !updated) {
            console.error('[hub_special_prices] approve', error);
            return res.status(500).json({ error: 'Erro ao aprovar preço especial' });
        }
        const [enriched] = await enrichRows([updated]);
        return res.json({ special_price: enriched });
    }
    catch (e) {
        console.error('[hub_special_prices] approve', e);
        return res.status(500).json({ error: 'Erro ao aprovar preço especial' });
    }
};
exports.approveHubSpecialPrice = approveHubSpecialPrice;
/**
 * Upsert conveniente a partir da agenda: cria/atualiza acordo pet ou tutor
 * e devolve o valor a aplicar no snapshot.
 */
async function upsertSpecialPriceFromAppointment(input) {
    const petAssert = await assertPetInClinic(input.clinicId, input.petId);
    if (!petAssert.ok)
        return { error: petAssert.error };
    const guardianId = input.guardianId ?? petAssert.guardian_id;
    if (!guardianId)
        return { error: 'Pet sem tutor vinculado' };
    const catalogSale = await fetchCatalogSale(input.clinicId, input.hubServiceTypeId);
    if (catalogSale == null)
        return { error: 'Tipo de serviço não encontrado' };
    const autoApprove = await canAutoApprove(input.userId, input.clinicId);
    const status = autoApprove ? 'active' : 'pending_approval';
    // Procura acordo existente (mesmo escopo) ativo ou pending
    let existingQ = supabase_1.supabaseAdmin
        .from('hub_special_prices')
        .select('id, status')
        .eq('clinic_id', input.clinicId)
        .eq('scope', input.scope)
        .eq('hub_service_type_id', input.hubServiceTypeId)
        .in('status', ['active', 'pending_approval']);
    if (input.scope === 'pet')
        existingQ = existingQ.eq('pet_id', input.petId);
    else
        existingQ = existingQ.eq('guardian_id', guardianId);
    const { data: existingRows } = await existingQ.limit(1);
    const existing = existingRows?.[0];
    if (existing) {
        const nextStatus = existing.status === 'active' && !autoApprove ? 'pending_approval' : status === 'active' ? 'active' : existing.status === 'active' ? 'active' : status;
        const patch = {
            sale_amount: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(input.saleAmount),
            catalog_sale_at_set: catalogSale,
            needs_catalog_review: false,
            status: nextStatus,
        };
        if (input.notes != null)
            patch.notes = input.notes;
        if (nextStatus === 'active') {
            patch.approved_by = input.userId;
            patch.approved_at = new Date().toISOString();
        }
        await supabase_1.supabaseAdmin.from('hub_special_prices').update(patch).eq('id', existing.id);
        return {
            special_price_id: existing.id,
            status: String(patch.status),
            auto_approved: nextStatus === 'active' && autoApprove,
        };
    }
    if (status === 'active') {
        await deactivateConflicting({
            clinicId: input.clinicId,
            scope: input.scope,
            petId: input.scope === 'pet' ? input.petId : null,
            guardianId,
            hubServiceTypeId: input.hubServiceTypeId,
        });
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_special_prices')
        .insert({
        clinic_id: input.clinicId,
        scope: input.scope,
        guardian_id: guardianId,
        pet_id: input.scope === 'pet' ? input.petId : null,
        hub_service_type_id: input.hubServiceTypeId,
        sale_amount: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(input.saleAmount),
        notes: input.notes?.trim() || null,
        status,
        created_by: input.userId,
        approved_by: autoApprove ? input.userId : null,
        approved_at: autoApprove ? new Date().toISOString() : null,
        catalog_sale_at_set: catalogSale,
        auto_track_catalog: false,
        needs_catalog_review: false,
    })
        .select('id, status')
        .single();
    if (error || !data) {
        console.error('[hub_special_prices] upsertFromAppointment', error);
        return { error: 'Erro ao salvar preço especial' };
    }
    return {
        special_price_id: data.id,
        status: data.status,
        auto_approved: autoApprove,
    };
}
