"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateHubGuardian = exports.createHubGuardian = exports.listHubGuardians = exports.getHubGuardianById = exports.getHubGuardianStats = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
/** Colunas persistidas em `hub_guardians` (exceto deleted_at em create). */
const GUARDIAN_SELECT = 'id, clinic_id, full_name, phone, email, notes, created_at, updated_at, deleted_at, client_kind, legal_name, birth_date, sex, tax_id, id_doc_type, id_doc_number, lead_source, postal_code, state, city, district, street, street_number, complement, client_status';
const clientKindSchema = zod_1.z.enum(['individual', 'company']);
const clientStatusSchema = zod_1.z.enum(['active', 'inactive']);
const sexSchema = zod_1.z.enum(['M', 'F', 'U']).optional().nullable();
const optionalTrimmed = (max) => zod_1.z
    .union([zod_1.z.string(), zod_1.z.null(), zod_1.z.undefined()])
    .transform((v) => (v === undefined || v === null ? undefined : String(v).trim()))
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || v === undefined || v.length <= max, { message: 'Texto muito longo' });
const createHubGuardianBodySchema = zod_1.z.object({
    clinic_id: uuidStr,
    full_name: zod_1.z.string().trim().min(1, 'Nome é obrigatório').max(200),
    phone: zod_1.z.string().trim().min(1, 'Telefone é obrigatório').max(40),
    email: optionalTrimmed(254).optional(),
    notes: optionalTrimmed(8000).optional(),
    client_kind: clientKindSchema.optional(),
    legal_name: optionalTrimmed(200).optional(),
    birth_date: zod_1.z
        .union([zod_1.z.string(), zod_1.z.null(), zod_1.z.undefined()])
        .optional()
        .transform((v) => (v === undefined || v === null || v === '' ? undefined : String(v)))
        .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Data inválida (use AAAA-MM-DD)' }),
    sex: sexSchema,
    tax_id: zod_1.z.string().trim().min(1, 'CPF/CNPJ é obrigatório').max(32),
    id_doc_type: optionalTrimmed(80).optional(),
    id_doc_number: optionalTrimmed(80).optional(),
    lead_source: optionalTrimmed(120).optional(),
    postal_code: optionalTrimmed(16).optional(),
    state: optionalTrimmed(80).optional(),
    city: optionalTrimmed(120).optional(),
    district: optionalTrimmed(120).optional(),
    street: optionalTrimmed(200).optional(),
    street_number: optionalTrimmed(32).optional(),
    complement: optionalTrimmed(120).optional(),
    client_status: clientStatusSchema.optional(),
});
const updateHubGuardianBodySchema = zod_1.z.object({
    clinic_id: uuidStr,
    full_name: zod_1.z.string().trim().min(1).max(200).optional(),
    phone: zod_1.z.string().trim().max(40).optional().nullable(),
    email: optionalTrimmed(254).optional(),
    notes: optionalTrimmed(8000).optional(),
    /** true = soft delete; false = restaurar */
    archived: zod_1.z.boolean().optional(),
    client_kind: clientKindSchema.optional(),
    legal_name: optionalTrimmed(200).optional(),
    birth_date: zod_1.z
        .union([zod_1.z.string(), zod_1.z.null(), zod_1.z.undefined()])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : String(v)))
        .refine((v) => v === undefined || v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
        message: 'Data inválida (use AAAA-MM-DD)',
    }),
    sex: zod_1.z.enum(['M', 'F', 'U']).nullable().optional(),
    tax_id: zod_1.z
        .union([zod_1.z.undefined(), zod_1.z.string(), zod_1.z.null()])
        .transform((v) => (v === undefined ? undefined : v == null ? '' : String(v).trim()))
        .optional()
        .refine((v) => v === undefined || v.length >= 1, { message: 'CPF/CNPJ é obrigatório' })
        .refine((v) => v === undefined || v.length <= 32, { message: 'CPF/CNPJ muito longo' }),
    id_doc_type: optionalTrimmed(80).optional(),
    id_doc_number: optionalTrimmed(80).optional(),
    lead_source: optionalTrimmed(120).optional(),
    postal_code: optionalTrimmed(16).optional(),
    state: optionalTrimmed(80).optional(),
    city: optionalTrimmed(120).optional(),
    district: optionalTrimmed(120).optional(),
    street: optionalTrimmed(200).optional(),
    street_number: optionalTrimmed(32).optional(),
    complement: optionalTrimmed(120).optional(),
    client_status: clientStatusSchema.optional(),
});
async function fetchPetsByGuardianIds(clinicId, guardianIds) {
    const map = new Map();
    if (guardianIds.length === 0)
        return map;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('guardian_id, role, hub_pets(id, name, species, size_tier, coat_type, birth_date, clinic_id, deleted_at)')
        .in('guardian_id', guardianIds);
    if (error || !data) {
        console.error('[hub_guardians] fetchPetsByGuardianIds', error);
        return map;
    }
    for (const row of data) {
        const rawPet = row.hub_pets;
        const pet = Array.isArray(rawPet) ? rawPet[0] : rawPet;
        if (!pet || pet.clinic_id !== clinicId || pet.deleted_at != null)
            continue;
        if (row.role !== 'primary' && row.role !== 'secondary')
            continue;
        const list = map.get(row.guardian_id) ?? [];
        list.push({
            id: pet.id,
            name: pet.name,
            species: pet.species,
            role: row.role,
            size_tier: pet.size_tier || 'medio',
            coat_type: pet.coat_type ?? null,
            birth_date: pet.birth_date ?? null,
        });
        map.set(row.guardian_id, list);
    }
    for (const [, list] of map) {
        list.sort((a, b) => {
            if (a.role === 'primary' && b.role !== 'primary')
                return -1;
            if (a.role !== 'primary' && b.role === 'primary')
                return 1;
            return a.name.localeCompare(b.name);
        });
    }
    return map;
}
function startOfUtcMonth(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
const getHubGuardianStats = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = parsed.data;
        const monthStart = startOfUtcMonth(new Date()).toISOString();
        const [{ count: totalAll, error: e1 }, { count: activeStatus, error: e2 }, { count: newMonth, error: e3 }, petsRes,] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id', { count: 'exact', head: true })
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null),
            supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id', { count: 'exact', head: true })
                .eq('clinic_id', clinic_id)
                .eq('client_status', 'active')
                .is('deleted_at', null),
            supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id', { count: 'exact', head: true })
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .gte('created_at', monthStart),
            supabase_1.supabaseAdmin
                .from('hub_pets')
                .select('id, hub_pet_guardians(guardian_id)')
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null),
        ]);
        if (e1 || e2 || e3) {
            console.error('[hub_guardians] stats counts', e1, e2, e3);
            return res.status(500).json({ error: 'Erro ao calcular estatísticas' });
        }
        const guardianWithPet = new Set();
        if (petsRes.data) {
            for (const pet of petsRes.data) {
                const links = pet.hub_pet_guardians;
                if (!links)
                    continue;
                for (const l of links) {
                    guardianWithPet.add(l.guardian_id);
                }
            }
        }
        const total = totalAll ?? 0;
        const active_operational = activeStatus ?? 0;
        const new_this_month = newMonth ?? 0;
        const with_pets = guardianWithPet.size;
        return res.json({
            stats: {
                total,
                active_operational,
                new_this_month,
                with_pets,
                /** Percentagens 0–100 para UI */
                pct_active: total > 0 ? Math.round((active_operational / total) * 100) : 0,
                pct_with_pets: total > 0 ? Math.round((with_pets / total) * 100) : 0,
            },
        });
    }
    catch (e) {
        console.error('[hub_guardians] stats', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubGuardianStats = getHubGuardianStats;
const getHubGuardianById = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const id = idParsed.data;
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = clinicParsed.data;
        const { data: row, error } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select(GUARDIAN_SELECT)
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (error) {
            console.error('[hub_guardians] getById', error);
            return res.status(500).json({ error: 'Erro ao carregar cliente' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }
        const petMap = await fetchPetsByGuardianIds(clinic_id, [id]);
        const pets = petMap.get(id) ?? [];
        return res.json({ guardian: row, pets });
    }
    catch (e) {
        console.error('[hub_guardians] getById', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubGuardianById = getHubGuardianById;
const listHubGuardians = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = parsed.data;
        const kind = zod_1.z.enum(['individual', 'company', 'all']).optional().safeParse(req.query.kind);
        const status = zod_1.z.enum(['active', 'inactive', 'all']).optional().safeParse(req.query.status);
        const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        let query = supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select(GUARDIAN_SELECT)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('full_name', { ascending: true });
        if (kind.success && kind.data && kind.data !== 'all') {
            query = query.eq('client_kind', kind.data);
        }
        if (status.success && status.data && status.data !== 'all') {
            query = query.eq('client_status', status.data);
        }
        if (qRaw.length > 0) {
            const safe = qRaw.replace(/%/g, '').replace(/,/g, ' ').trim();
            if (safe.length > 0) {
                const p = `%${safe}%`;
                query = query.or(`full_name.ilike.${p},phone.ilike.${p},email.ilike.${p},legal_name.ilike.${p}`);
            }
        }
        const { data, error } = await query;
        if (error) {
            console.error('[hub_guardians] list', error);
            return res.status(500).json({ error: 'Erro ao listar tutores' });
        }
        const rows = data ?? [];
        const ids = rows.map((r) => r.id);
        const petMap = await fetchPetsByGuardianIds(clinic_id, ids);
        const guardians = rows.map((g) => ({
            ...g,
            pets: petMap.get(g.id) ?? [],
        }));
        return res.json({ guardians });
    }
    catch (e) {
        console.error('[hub_guardians] list', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubGuardians = listHubGuardians;
const createHubGuardian = async (req, res) => {
    try {
        const body = createHubGuardianBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const d = body.data;
        const row = {
            clinic_id: d.clinic_id,
            full_name: d.full_name,
            phone: d.phone,
            email: d.email ?? null,
            notes: d.notes ?? null,
            deleted_at: null,
            client_kind: d.client_kind ?? 'individual',
            legal_name: d.legal_name ?? null,
            birth_date: d.birth_date ?? null,
            sex: d.sex ?? null,
            tax_id: d.tax_id,
            id_doc_type: d.id_doc_type ?? null,
            id_doc_number: d.id_doc_number ?? null,
            lead_source: d.lead_source ?? null,
            postal_code: d.postal_code ?? null,
            state: d.state ?? null,
            city: d.city ?? null,
            district: d.district ?? null,
            street: d.street ?? null,
            street_number: d.street_number ?? null,
            complement: d.complement ?? null,
            client_status: d.client_status ?? 'active',
        };
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .insert([row])
            .select(GUARDIAN_SELECT)
            .single();
        if (error) {
            console.error('[hub_guardians] create', error);
            return res.status(500).json({ error: 'Erro ao criar tutor' });
        }
        return res.status(201).json({ guardian: data, pets: [] });
    }
    catch (e) {
        console.error('[hub_guardians] create', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubGuardian = createHubGuardian;
const updateHubGuardian = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const id = idParsed.data;
        const body = updateHubGuardianBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const d = body.data;
        const { clinic_id, archived } = d;
        const { data: existing, error: fetchErr } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id, clinic_id, deleted_at')
            .eq('id', id)
            .maybeSingle();
        if (fetchErr || !existing) {
            return res.status(404).json({ error: 'Tutor não encontrado' });
        }
        if (existing.clinic_id !== clinic_id) {
            return res.status(403).json({ error: 'Tutor não pertence a esta clínica' });
        }
        const patch = {};
        if (archived === true) {
            patch.deleted_at = new Date().toISOString();
        }
        else if (archived === false) {
            patch.deleted_at = null;
        }
        if (d.full_name !== undefined)
            patch.full_name = d.full_name;
        if (d.phone !== undefined)
            patch.phone = d.phone;
        if (d.email !== undefined) {
            patch.email = d.email && String(d.email).trim() !== '' ? String(d.email).trim() : null;
        }
        if (d.notes !== undefined)
            patch.notes = d.notes;
        if (d.client_kind !== undefined)
            patch.client_kind = d.client_kind;
        if (d.legal_name !== undefined)
            patch.legal_name = d.legal_name;
        if (d.birth_date !== undefined)
            patch.birth_date = d.birth_date;
        if (d.sex !== undefined)
            patch.sex = d.sex;
        if (d.tax_id !== undefined)
            patch.tax_id = d.tax_id;
        if (d.id_doc_type !== undefined)
            patch.id_doc_type = d.id_doc_type;
        if (d.id_doc_number !== undefined)
            patch.id_doc_number = d.id_doc_number;
        if (d.lead_source !== undefined)
            patch.lead_source = d.lead_source;
        if (d.postal_code !== undefined)
            patch.postal_code = d.postal_code;
        if (d.state !== undefined)
            patch.state = d.state;
        if (d.city !== undefined)
            patch.city = d.city;
        if (d.district !== undefined)
            patch.district = d.district;
        if (d.street !== undefined)
            patch.street = d.street;
        if (d.street_number !== undefined)
            patch.street_number = d.street_number;
        if (d.complement !== undefined)
            patch.complement = d.complement;
        if (d.client_status !== undefined)
            patch.client_status = d.client_status;
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .update(patch)
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .select(GUARDIAN_SELECT)
            .maybeSingle();
        if (error) {
            console.error('[hub_guardians] update', error);
            return res.status(500).json({ error: 'Erro ao atualizar tutor' });
        }
        const petMap = await fetchPetsByGuardianIds(clinic_id, [id]);
        const pets = petMap.get(id) ?? [];
        return res.json({ guardian: data, pets });
    }
    catch (e) {
        console.error('[hub_guardians] update', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.updateHubGuardian = updateHubGuardian;
