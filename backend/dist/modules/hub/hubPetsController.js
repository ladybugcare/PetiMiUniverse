"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateHubPet = exports.createHubPet = exports.listHubPets = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
const uuidStr = zod_1.z.string().uuid();
const optionalDate = zod_1.z
    .union([zod_1.z.string().length(0), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v));
const sexSchema = zod_1.z.enum(['M', 'F', 'U']).optional().nullable();
const petSizeTierSchema = zod_1.z.enum(['mini', 'pequeno', 'medio', 'grande', 'gigante']);
const petCoatTypeSchema = zod_1.z.enum(hubServiceTypesPricingMatrix_1.COAT_TYPE_VALUES).optional().nullable();
const createHubPetBodySchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(200),
    species: zod_1.z.string().trim().min(1).max(120),
    breed: zod_1.z.string().trim().max(200).optional().nullable(),
    sex: sexSchema,
    birth_date: optionalDate,
    notes: zod_1.z.string().trim().max(8000).optional().nullable(),
    size_tier: petSizeTierSchema,
    coat_color: zod_1.z.string().trim().max(120).optional().nullable(),
    coat_type: petCoatTypeSchema,
    primary_guardian_id: uuidStr,
    secondary_guardian_id: uuidStr.optional().nullable(),
});
const updateHubPetBodySchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(200).optional(),
    species: zod_1.z.string().trim().min(1).max(120).optional(),
    breed: zod_1.z.string().trim().max(200).optional().nullable(),
    sex: sexSchema,
    birth_date: optionalDate.nullable(),
    notes: zod_1.z.string().trim().max(8000).optional().nullable(),
    size_tier: petSizeTierSchema.optional(),
    coat_color: zod_1.z.string().trim().max(120).optional().nullable(),
    coat_type: petCoatTypeSchema,
    archived: zod_1.z.boolean().optional(),
    primary_guardian_id: uuidStr.optional(),
    secondary_guardian_id: uuidStr.optional().nullable(),
});
async function guardianActiveInClinic(guardianId, clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_guardians')
        .select('id')
        .eq('id', guardianId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return !error && !!data;
}
const listHubPets = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = parsed.data;
        const { data: pets, error: petsErr } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id, petmi_pet_id, clinic_id, name, species, breed, sex, birth_date, notes, size_tier, coat_color, coat_type, created_at, updated_at')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('name', { ascending: true });
        if (petsErr) {
            console.error('[hub_pets] list', petsErr);
            return res.status(500).json({ error: 'Erro ao listar pets' });
        }
        const list = pets ?? [];
        if (list.length === 0) {
            return res.json({ pets: [] });
        }
        const petIds = list.map((p) => p.id);
        const { data: primaries, error: linkErr } = await supabase_1.supabaseAdmin
            .from('hub_pet_guardians')
            .select('pet_id, guardian_id, hub_guardians(full_name)')
            .eq('role', 'primary')
            .in('pet_id', petIds);
        if (linkErr) {
            console.error('[hub_pets] list primaries', linkErr);
            return res.status(500).json({ error: 'Erro ao carregar tutores dos pets' });
        }
        const { data: secondaries, error: secListErr } = await supabase_1.supabaseAdmin
            .from('hub_pet_guardians')
            .select('pet_id, guardian_id, hub_guardians(full_name)')
            .eq('role', 'secondary')
            .in('pet_id', petIds);
        if (secListErr) {
            console.error('[hub_pets] list secondaries', secListErr);
            return res.status(500).json({ error: 'Erro ao carregar tutores secundários' });
        }
        const primaryByPet = new Map();
        for (const row of primaries ?? []) {
            const g = row.hub_guardians;
            primaryByPet.set(row.pet_id, {
                guardian_id: row.guardian_id,
                guardian_name: g?.full_name ?? null,
            });
        }
        const secondaryByPet = new Map();
        for (const row of secondaries ?? []) {
            if (secondaryByPet.has(row.pet_id))
                continue;
            const g = row.hub_guardians;
            secondaryByPet.set(row.pet_id, {
                guardian_id: row.guardian_id,
                guardian_name: g?.full_name ?? null,
            });
        }
        const enriched = list.map((p) => ({
            ...p,
            primary_guardian: primaryByPet.get(p.id) ?? null,
            secondary_guardian: secondaryByPet.get(p.id) ?? null,
        }));
        return res.json({ pets: enriched });
    }
    catch (e) {
        console.error('[hub_pets] list', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubPets = listHubPets;
const createHubPet = async (req, res) => {
    try {
        const body = createHubPetBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, name, species, breed, sex, birth_date, notes, size_tier, coat_color, coat_type, primary_guardian_id, secondary_guardian_id, } = body.data;
        if (!(await guardianActiveInClinic(primary_guardian_id, clinic_id))) {
            return res.status(400).json({ error: 'Tutor principal inválido ou não pertence à clínica' });
        }
        if (secondary_guardian_id &&
            secondary_guardian_id !== primary_guardian_id &&
            !(await guardianActiveInClinic(secondary_guardian_id, clinic_id))) {
            return res.status(400).json({ error: 'Tutor secundário inválido ou não pertence à clínica' });
        }
        if (secondary_guardian_id === primary_guardian_id) {
            return res.status(400).json({ error: 'Tutor secundário não pode ser igual ao principal' });
        }
        const petRow = {
            clinic_id,
            name,
            species,
            breed: breed ?? null,
            sex: sex ?? null,
            birth_date: birth_date ?? null,
            notes: notes ?? null,
            size_tier,
            coat_color: coat_color ?? null,
            coat_type: coat_type ?? null,
            deleted_at: null,
        };
        const { data: pet, error: petErr } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .insert([petRow])
            .select('id, petmi_pet_id, clinic_id, name, species, breed, sex, birth_date, notes, size_tier, coat_color, coat_type, created_at, updated_at')
            .single();
        if (petErr || !pet) {
            console.error('[hub_pets] create pet', petErr);
            return res.status(500).json({ error: 'Erro ao criar pet' });
        }
        const links = [
            { pet_id: pet.id, guardian_id: primary_guardian_id, role: 'primary' },
        ];
        if (secondary_guardian_id) {
            links.push({ pet_id: pet.id, guardian_id: secondary_guardian_id, role: 'secondary' });
        }
        const { error: linkErr } = await supabase_1.supabaseAdmin.from('hub_pet_guardians').insert(links);
        if (linkErr) {
            console.error('[hub_pets] create links', linkErr);
            await supabase_1.supabaseAdmin.from('hub_pets').delete().eq('id', pet.id);
            return res.status(500).json({ error: 'Erro ao associar tutores ao pet' });
        }
        return res.status(201).json({
            pet: {
                ...pet,
                primary_guardian: {
                    guardian_id: primary_guardian_id,
                    guardian_name: null,
                },
            },
        });
    }
    catch (e) {
        console.error('[hub_pets] create', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubPet = createHubPet;
const updateHubPet = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const id = idParsed.data;
        const body = updateHubPetBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, name, species, breed, sex, birth_date, notes, archived, primary_guardian_id, secondary_guardian_id, size_tier, coat_color, coat_type, } = body.data;
        if (name === undefined &&
            species === undefined &&
            breed === undefined &&
            sex === undefined &&
            birth_date === undefined &&
            notes === undefined &&
            size_tier === undefined &&
            coat_color === undefined &&
            coat_type === undefined &&
            archived === undefined &&
            primary_guardian_id === undefined &&
            secondary_guardian_id === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        const { data: existing, error: fetchErr } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id, clinic_id')
            .eq('id', id)
            .maybeSingle();
        if (fetchErr || !existing) {
            return res.status(404).json({ error: 'Pet não encontrado' });
        }
        if (existing.clinic_id !== clinic_id) {
            return res.status(403).json({ error: 'Pet não pertence a esta clínica' });
        }
        const patch = {};
        if (archived === true)
            patch.deleted_at = new Date().toISOString();
        else if (archived === false)
            patch.deleted_at = null;
        if (name !== undefined)
            patch.name = name;
        if (species !== undefined)
            patch.species = species;
        if (breed !== undefined)
            patch.breed = breed;
        if (sex !== undefined)
            patch.sex = sex;
        if (birth_date !== undefined)
            patch.birth_date = birth_date;
        if (notes !== undefined)
            patch.notes = notes;
        if (size_tier !== undefined)
            patch.size_tier = size_tier;
        if (coat_color !== undefined)
            patch.coat_color = coat_color;
        if (coat_type !== undefined)
            patch.coat_type = coat_type;
        if (primary_guardian_id !== undefined) {
            if (!(await guardianActiveInClinic(primary_guardian_id, clinic_id))) {
                return res.status(400).json({ error: 'Tutor principal inválido ou não pertence à clínica' });
            }
            await supabase_1.supabaseAdmin.from('hub_pet_guardians').delete().eq('pet_id', id).eq('role', 'primary');
            const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_pet_guardians').insert([
                { pet_id: id, guardian_id: primary_guardian_id, role: 'primary' },
            ]);
            if (insErr) {
                console.error('[hub_pets] update primary', insErr);
                return res.status(500).json({ error: 'Erro ao atualizar tutor principal' });
            }
        }
        if (secondary_guardian_id !== undefined) {
            await supabase_1.supabaseAdmin.from('hub_pet_guardians').delete().eq('pet_id', id).eq('role', 'secondary');
            if (secondary_guardian_id) {
                const { data: prim } = await supabase_1.supabaseAdmin
                    .from('hub_pet_guardians')
                    .select('guardian_id')
                    .eq('pet_id', id)
                    .eq('role', 'primary')
                    .maybeSingle();
                const primaryG = prim?.guardian_id;
                if (secondary_guardian_id === primaryG) {
                    return res.status(400).json({ error: 'Tutor secundário não pode ser igual ao principal' });
                }
                if (!(await guardianActiveInClinic(secondary_guardian_id, clinic_id))) {
                    return res.status(400).json({ error: 'Tutor secundário inválido' });
                }
                const { error: secErr } = await supabase_1.supabaseAdmin.from('hub_pet_guardians').insert([
                    { pet_id: id, guardian_id: secondary_guardian_id, role: 'secondary' },
                ]);
                if (secErr) {
                    console.error('[hub_pets] update secondary', secErr);
                    return res.status(500).json({ error: 'Erro ao atualizar tutor secundário' });
                }
            }
        }
        if (Object.keys(patch).length > 0) {
            const { error: upErr } = await supabase_1.supabaseAdmin.from('hub_pets').update(patch).eq('id', id).eq('clinic_id', clinic_id);
            if (upErr) {
                console.error('[hub_pets] update', upErr);
                return res.status(500).json({ error: 'Erro ao atualizar pet' });
            }
        }
        const { data: pet, error: finalErr } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id, petmi_pet_id, clinic_id, name, species, breed, sex, birth_date, notes, size_tier, coat_color, coat_type, created_at, updated_at, deleted_at')
            .eq('id', id)
            .single();
        if (finalErr || !pet) {
            return res.status(500).json({ error: 'Erro ao recarregar pet' });
        }
        const { data: primaries } = await supabase_1.supabaseAdmin
            .from('hub_pet_guardians')
            .select('pet_id, guardian_id, hub_guardians(full_name)')
            .eq('pet_id', id)
            .eq('role', 'primary')
            .maybeSingle();
        const g = primaries?.hub_guardians;
        const primary_guardian = primaries
            ? {
                guardian_id: primaries.guardian_id,
                guardian_name: g?.full_name ?? null,
            }
            : null;
        const { data: secRow } = await supabase_1.supabaseAdmin
            .from('hub_pet_guardians')
            .select('guardian_id, hub_guardians(full_name)')
            .eq('pet_id', id)
            .eq('role', 'secondary')
            .limit(1)
            .maybeSingle();
        const sg = secRow?.hub_guardians;
        const secondary_guardian = secRow
            ? {
                guardian_id: secRow.guardian_id,
                guardian_name: sg?.full_name ?? null,
            }
            : null;
        return res.json({ pet: { ...pet, primary_guardian, secondary_guardian } });
    }
    catch (e) {
        console.error('[hub_pets] update', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.updateHubPet = updateHubPet;
