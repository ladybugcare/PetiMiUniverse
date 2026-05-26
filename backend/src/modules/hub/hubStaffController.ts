import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { checkPermission } from '../../middleware/authMiddleware';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';
import { generateInvitationToken, sendInvitationEmail } from '../../utils/emailService';
import { getRoleDisplayName, type Role } from '../../utils/permissions';
import { createNotification } from '../../controllers/notificationsController';

const uuidStr = z.string().uuid();

const STAFF_SELECT =
  'id, clinic_id, full_name, display_name, photo_url, phone, whatsapp_phone, email, birth_date, job_title, professional_kind, specialties, crmv, crmv_uf, internal_notes, active, has_hub_access, hub_access_email, hub_access_role, accepts_appointments, available_days, work_hours, break_minutes, default_unit_id, agenda_color, clinic_user_id, created_at, updated_at, deleted_at';

const professionalKindSchema = z.enum([
  'vet',
  'groomer',
  'bather',
  'reception',
  'driver',
  'caretaker',
  'assistant',
  'other',
]);

const hubAccessRoleSchema = z.enum(['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL']);

const optionalTrim = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === undefined || v === null ? undefined : String(v).trim()))
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || v === undefined || v.length <= max, { message: 'Texto muito longo' });

/** ISO `YYYY-MM-DD` ou vazio / null (opcional). */
const optionalBirthDate = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === '' ? null : s;
  })
  .refine((v) => v === undefined || v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'Data de nascimento inválida (AAAA-MM-DD)',
  });

const createStaffSchema = z
  .object({
    clinic_id: uuidStr,
    full_name: z.string().trim().min(1, 'Nome completo é obrigatório').max(200),
    display_name: optionalTrim(200).optional(),
    photo_url: optionalTrim(2000).optional(),
    phone: optionalTrim(64).optional(),
    whatsapp_phone: optionalTrim(64).optional(),
    email: z.union([z.string().email().max(254), z.literal(''), z.null()]).optional().nullable(),
    birth_date: optionalBirthDate,
    job_title: z.string().trim().min(1, 'Função/cargo é obrigatório').max(200),
    professional_kind: professionalKindSchema,
    specialties: optionalTrim(4000).optional(),
    crmv: optionalTrim(64).optional(),
    crmv_uf: optionalTrim(4).optional(),
    internal_notes: optionalTrim(8000).optional(),
    active: z.boolean().optional(),
    has_hub_access: z.boolean().optional(),
    hub_access_email: z.union([z.string().email().max(254), z.literal(''), z.null()]).optional().nullable(),
    hub_access_role: hubAccessRoleSchema.optional().nullable(),
    accepts_appointments: z.boolean().optional(),
    available_days: z.unknown().optional().nullable(),
    work_hours: z.unknown().optional().nullable(),
    break_minutes: z.coerce.number().int().min(0).max(24 * 60).optional().nullable(),
    default_unit_id: uuidStr.optional().nullable(),
    agenda_color: optionalTrim(16).optional(),
    service_type_ids: z.array(uuidStr).optional(),
  })
  .strict();

const patchStaffSchema = createStaffSchema.partial().required({ clinic_id: true });

async function assertStaffInClinic(clinicId: string, staffId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id, clinic_id, deleted_at')
    .eq('id', staffId)
    .maybeSingle();
  if (error || !data || data.clinic_id !== clinicId || data.deleted_at) return null;
  return data;
}

async function assertServiceTypesInClinic(clinicId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .in('id', ids);
  if (error || !data) return false;
  return data.length === ids.length;
}

async function replaceStaffServiceTypes(staffId: string, clinicId: string, serviceTypeIds: string[]) {
  await supabaseAdmin.from('hub_staff_service_types').delete().eq('staff_id', staffId);
  if (serviceTypeIds.length === 0) return;
  const ok = await assertServiceTypesInClinic(clinicId, serviceTypeIds);
  if (!ok) throw new Error('Um ou mais tipos de serviço não pertencem à clínica');
  const rows = serviceTypeIds.map((service_type_id) => ({ staff_id: staffId, service_type_id }));
  const { error } = await supabaseAdmin.from('hub_staff_service_types').insert(rows);
  if (error) throw error;
}

type StaffRow = Record<string, unknown>;

async function enrichStaffRows(clinicId: string, rows: StaffRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const { data: links } = await supabaseAdmin
    .from('hub_staff_service_types')
    .select('staff_id, service_type_id')
    .in('staff_id', ids);
  const typeIds = [...new Set((links ?? []).map((l) => l.service_type_id as string))];
  let typeMap = new Map<string, { id: string; name: string; code: string }>();
  if (typeIds.length > 0) {
    const { data: types } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, name, code')
      .eq('clinic_id', clinicId)
      .in('id', typeIds);
    for (const t of types ?? []) {
      typeMap.set(t.id as string, { id: t.id as string, name: t.name as string, code: t.code as string });
    }
  }
  const byStaff = new Map<string, { id: string; name: string; code: string }[]>();
  for (const l of links ?? []) {
    const sid = l.staff_id as string;
    const tid = l.service_type_id as string;
    const t = typeMap.get(tid);
    if (!t) continue;
    const arr = byStaff.get(sid) ?? [];
    arr.push(t);
    byStaff.set(sid, arr);
  }
  const unitIds = [...new Set(rows.map((r) => r.default_unit_id).filter(Boolean) as string[])];
  let unitNameById = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: units } = await supabaseAdmin.from('units').select('id, name').eq('clinic_id', clinicId).in('id', unitIds);
    for (const u of units ?? []) unitNameById.set(u.id as string, (u.name as string) || '');
  }
  return rows.map((r) => {
    const id = r.id as string;
    const services = byStaff.get(id) ?? [];
    const uid = r.default_unit_id as string | null;
    return {
      ...r,
      service_types: services,
      services_summary: services.map((s) => s.name).join(', ') || null,
      default_unit_name: uid ? unitNameById.get(uid) ?? null : null,
      /** Reservado: quando existir API de agenda no Hub, substituir por contagem real. */
      next_appointments_count: 0,
    };
  });
}

export const listHubStaff = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const activeOnly = req.query.active_only === 'true' || req.query.active_only === '1';

    let query = supabaseAdmin
      .from('hub_staff_members')
      .select(STAFF_SELECT)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('full_name', { ascending: true });

    if (activeOnly) query = query.eq('active', true);
    if (q) {
      const esc = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `full_name.ilike.%${esc}%,display_name.ilike.%${esc}%,job_title.ilike.%${esc}%,email.ilike.%${esc}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[hub_staff] list', error);
      return res.status(500).json({ error: 'Erro ao listar equipe' });
    }
    const rows = (data ?? []) as StaffRow[];
    const staff = await enrichStaffRows(clinic_id, rows);
    return res.json({
      staff,
      /** Regra produto: apenas `active` entram em filtros de novos atendimentos (agenda futura). */
      meta: {
        next_appointments_placeholder: true,
        inactive_hidden_from_new_scheduling: true,
      },
    });
  } catch (e) {
    console.error('[hub_staff] list', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const getHubStaff = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!idParsed.success || !clinicParsed.success) {
      return res.status(400).json({ error: 'id ou clinic_id inválido' });
    }
    const { data, error } = await supabaseAdmin
      .from('hub_staff_members')
      .select(STAFF_SELECT)
      .eq('id', idParsed.data)
      .eq('clinic_id', clinicParsed.data)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Profissional não encontrado' });
    const [enriched] = await enrichStaffRows(clinicParsed.data, [data as StaffRow]);
    return res.json({ staff: enriched });
  } catch (e) {
    console.error('[hub_staff] get', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const createHubStaff = async (req: Request, res: Response) => {
  try {
    const body = createStaffSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const d = body.data;
    const emailNorm = d.email === '' || d.email === undefined ? null : d.email;
    const hubEmailNorm =
      d.hub_access_email === '' || d.hub_access_email === undefined ? null : d.hub_access_email;
    if (d.default_unit_id) {
      const { data: u } = await supabaseAdmin.from('units').select('id, clinic_id').eq('id', d.default_unit_id).maybeSingle();
      if (!u || u.clinic_id !== d.clinic_id) return res.status(400).json({ error: 'Unidade inválida para esta clínica' });
    }
    const serviceIds = d.service_type_ids ?? [];
    if (serviceIds.length > 0) {
      const ok = await assertServiceTypesInClinic(d.clinic_id, serviceIds);
      if (!ok) return res.status(400).json({ error: 'Tipo de serviço inválido' });
    }
    const insertRow = {
      clinic_id: d.clinic_id,
      full_name: d.full_name,
      display_name: d.display_name ?? null,
      photo_url: d.photo_url ?? null,
      phone: d.phone ?? null,
      whatsapp_phone: d.whatsapp_phone ?? null,
      email: emailNorm,
      birth_date: d.birth_date ?? null,
      job_title: d.job_title,
      professional_kind: d.professional_kind,
      specialties: d.specialties ?? null,
      crmv: d.crmv ?? null,
      crmv_uf: d.crmv_uf ?? null,
      internal_notes: d.internal_notes ?? null,
      active: d.active ?? true,
      has_hub_access: d.has_hub_access ?? false,
      hub_access_email: hubEmailNorm,
      hub_access_role: d.hub_access_role ?? null,
      accepts_appointments: d.accepts_appointments ?? false,
      available_days: d.available_days ?? null,
      work_hours: d.work_hours ?? null,
      break_minutes: d.break_minutes ?? null,
      default_unit_id: d.default_unit_id ?? null,
      agenda_color: d.agenda_color ?? null,
    };
    const { data: created, error } = await supabaseAdmin.from('hub_staff_members').insert([insertRow]).select(STAFF_SELECT).single();
    if (error || !created) {
      console.error('[hub_staff] create', error);
      return res.status(500).json({ error: error?.message || 'Erro ao criar profissional' });
    }
    await replaceStaffServiceTypes(created.id as string, d.clinic_id, serviceIds);
    const [enriched] = await enrichStaffRows(d.clinic_id, [created as StaffRow]);
    return res.status(201).json({ staff: enriched });
  } catch (e) {
    console.error('[hub_staff] create', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const patchHubStaff = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const body = patchStaffSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten?.() });
    }
    const clinic_id = body.data.clinic_id;
    if (!clinic_id) return res.status(400).json({ error: 'clinic_id é obrigatório no corpo' });
    const staff = await assertStaffInClinic(clinic_id, idParsed.data);
    if (!staff) return res.status(404).json({ error: 'Profissional não encontrado' });

    const d = body.data;
    const patch: Record<string, unknown> = {};
    if (d.full_name !== undefined) patch.full_name = d.full_name;
    if (d.display_name !== undefined) patch.display_name = d.display_name;
    if (d.photo_url !== undefined) patch.photo_url = d.photo_url;
    if (d.phone !== undefined) patch.phone = d.phone;
    if (d.whatsapp_phone !== undefined) patch.whatsapp_phone = d.whatsapp_phone;
    if (d.email !== undefined) patch.email = d.email === '' ? null : d.email;
    if (d.birth_date !== undefined) patch.birth_date = d.birth_date;
    if (d.job_title !== undefined) patch.job_title = d.job_title;
    if (d.professional_kind !== undefined) patch.professional_kind = d.professional_kind;
    if (d.specialties !== undefined) patch.specialties = d.specialties;
    if (d.crmv !== undefined) patch.crmv = d.crmv;
    if (d.crmv_uf !== undefined) patch.crmv_uf = d.crmv_uf;
    if (d.internal_notes !== undefined) patch.internal_notes = d.internal_notes;
    if (d.active !== undefined) patch.active = d.active;
    if (d.has_hub_access !== undefined) patch.has_hub_access = d.has_hub_access;
    if (d.hub_access_email !== undefined) patch.hub_access_email = d.hub_access_email === '' ? null : d.hub_access_email;
    if (d.hub_access_role !== undefined) patch.hub_access_role = d.hub_access_role;
    if (d.accepts_appointments !== undefined) patch.accepts_appointments = d.accepts_appointments;
    if (d.available_days !== undefined) patch.available_days = d.available_days;
    if (d.work_hours !== undefined) patch.work_hours = d.work_hours;
    if (d.break_minutes !== undefined) patch.break_minutes = d.break_minutes;
    if (d.default_unit_id !== undefined) {
      if (d.default_unit_id) {
        const { data: u } = await supabaseAdmin.from('units').select('id, clinic_id').eq('id', d.default_unit_id).maybeSingle();
        if (!u || u.clinic_id !== clinic_id) return res.status(400).json({ error: 'Unidade inválida' });
      }
      patch.default_unit_id = d.default_unit_id;
    }
    if (d.agenda_color !== undefined) patch.agenda_color = d.agenda_color;

    if (Object.keys(patch).length > 0) {
      const { data: updated, error } = await supabaseAdmin
        .from('hub_staff_members')
        .update(patch)
        .eq('id', idParsed.data)
        .eq('clinic_id', clinic_id)
        .select(STAFF_SELECT)
        .single();
      if (error || !updated) {
        console.error('[hub_staff] patch', error);
        return res.status(500).json({ error: error?.message || 'Erro ao atualizar' });
      }
    }
    if (d.service_type_ids !== undefined) {
      await replaceStaffServiceTypes(idParsed.data, clinic_id, d.service_type_ids);
    }
    const { data: fresh } = await supabaseAdmin
      .from('hub_staff_members')
      .select(STAFF_SELECT)
      .eq('id', idParsed.data)
      .eq('clinic_id', clinic_id)
      .single();
    const [enriched] = await enrichStaffRows(clinic_id, [fresh as StaffRow]);
    return res.json({ staff: enriched });
  } catch (e) {
    console.error('[hub_staff] patch', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const inviteStaffBodySchema = z.object({ clinic_id: uuidStr }).strict();

export const inviteHubStaff = async (req: Request, res: Response) => {
  const invited_by = req.user!.id;
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const body = inviteStaffBodySchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      return res.status(400).json({ error: 'clinic_id inválido' });
    }
    const clinic_id = body.data.clinic_id;
    const staffId = idParsed.data;

    const canStaff = await checkPermission(invited_by, clinic_id, 'hub.staff.invite');
    const canUserInvite = await checkPermission(invited_by, clinic_id, 'user.invite');
    if (!canStaff || !canUserInvite) {
      return res.status(403).json({ error: 'Sem permissão para enviar convite (requer convite de usuários e convite de equipe)' });
    }

    const { data: row, error: loadErr } = await supabaseAdmin
      .from('hub_staff_members')
      .select(STAFF_SELECT)
      .eq('id', staffId)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (loadErr || !row) return res.status(404).json({ error: 'Profissional não encontrado' });

    if (!row.has_hub_access) return res.status(400).json({ error: 'Profissional sem acesso ao Hub — active «Tem acesso» primeiro' });
    const email = (row.hub_access_email as string | null)?.trim();
    if (!email) return res.status(400).json({ error: 'Defina o e-mail de acesso antes de convidar' });
    const role = row.hub_access_role as Role | null;
    if (!role) return res.status(400).json({ error: 'Defina o perfil de acesso antes de convidar' });
    const unit_id = row.default_unit_id as string | null;
    if (!unit_id) return res.status(400).json({ error: 'Defina a unidade padrão antes de convidar' });

    const { data: unitCheck } = await supabaseAdmin.from('units').select('id, clinic_id').eq('id', unit_id).maybeSingle();
    if (!unitCheck || unitCheck.clinic_id !== clinic_id) return res.status(400).json({ error: 'Unidade inválida' });

    const { data: existingUnitUsers } = await supabaseAdmin
      .from('clinic_users')
      .select('user_id')
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id);
    if (existingUnitUsers?.length) {
      for (const cu of existingUnitUsers) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(cu.user_id as string);
        if (authUser?.user?.email?.toLowerCase() === email.toLowerCase()) {
          return res.status(400).json({ error: 'Este e-mail já está vinculado a esta unidade' });
        }
      }
    }

    const { data: existingInvitation } = await supabaseAdmin
      .from('user_invitations')
      .select('id')
      .eq('email', email)
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id)
      .eq('status', 'pending');
    if (existingInvitation && existingInvitation.length > 0) {
      return res.status(400).json({ error: 'Já existe um convite pendente para este e-mail nesta unidade' });
    }

    const token = generateInvitationToken();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invRows, error: invErr } = await supabaseAdmin
      .from('user_invitations')
      .insert([
        {
          email,
          clinic_id,
          unit_id,
          role,
          invited_by,
          token,
          expires_at,
        },
      ])
      .select();

    if (invErr || !invRows?.[0]) {
      console.error('[hub_staff] invite insert', invErr);
      return res.status(400).json({ error: invErr?.message || 'Erro ao criar convite' });
    }

    await sendInvitationEmail(email, token, clinic_id, unit_id, getRoleDisplayName(role));

    const { data: clinic } = await supabaseAdmin.from('clinics').select('name').eq('id', clinic_id).single();
    const { data: unit } = await supabaseAdmin.from('units').select('name').eq('id', unit_id).single();

    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuthUser = usersData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (existingAuthUser?.id && clinic && unit) {
        await createNotification({
          user_id: existingAuthUser.id,
          type: 'unit_invitation',
          title: 'Convite para Unidade',
          message: `Foi convidado para a unidade "${unit.name}" da clínica "${clinic.name}" como ${getRoleDisplayName(role)}`,
          link: `/accept-invitation?token=${token}`,
          entity_type: 'invitation',
          entity_id: invRows[0].id,
        });
      }
    } catch (notifErr) {
      console.warn('[hub_staff] invite notification', notifErr);
    }

    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: invited_by,
      clinic_id,
      unit_id,
      action: 'HUB_STAFF_INVITE',
      entity_type: 'invitation',
      entity_id: invRows[0].id as string,
      new_values: { email, role, staff_id: staffId },
      ...metadata,
    });

    return res.status(201).json({ invitation: invRows[0] });
  } catch (error: unknown) {
    console.error('[hub_staff] invite', error);
    return res.status(500).json({ error: 'Erro ao convidar' });
  }
};
