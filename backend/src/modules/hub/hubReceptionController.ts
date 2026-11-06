import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { handoffInDay, resolveReceptionHandoff, syncReceptionUnit } from './receptionHandoffService';
import { todayYmdSaoPaulo } from './receptionCustody';

const uuidStr = z.string().uuid();
const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const boardQuery = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr,
  date: dateYmd.optional(),
});

async function staffIdForUser(clinicId: string, userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data: clinicUser } = await supabaseAdmin
    .from('clinic_users')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!clinicUser?.id) return null;
  const { data: staff } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('clinic_user_id', clinicUser.id)
    .is('deleted_at', null)
    .maybeSingle();
  return (staff?.id as string | undefined) ?? null;
}

/** GET /reception/board */
export const getHubReceptionBoard = async (req: Request, res: Response) => {
  try {
    const parsed = boardQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
    const day = parsed.data.date || todayYmdSaoPaulo();
    await syncReceptionUnit(parsed.data.clinic_id, parsed.data.unit_id, day);

    const { data, error } = await supabaseAdmin
      .from('hub_reception_handoffs')
      .select(
        'id, kind, source_type, source_id, status, context, opened_at, resolved_at, resolution, pet_id, guardian_id, pet:hub_pets(id, name), guardian:hub_guardians(id, full_name, phone)',
      )
      .eq('clinic_id', parsed.data.clinic_id)
      .eq('unit_id', parsed.data.unit_id)
      .order('opened_at', { ascending: true })
      .limit(300);
    if (error) return res.status(500).json({ error: error.message });

    const items = (data ?? [])
      .filter((row) =>
        handoffInDay(
          {
            status: String(row.status),
            opened_at: String(row.opened_at),
            resolved_at: (row.resolved_at as string | null) ?? null,
          },
          day,
        ),
      )
      .map((row) => {
        const pet = row.pet as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
        const guardian = row.guardian as
          | { id?: string; full_name?: string; phone?: string | null }
          | { id?: string; full_name?: string; phone?: string | null }[]
          | null;
        const petRow = Array.isArray(pet) ? pet[0] : pet;
        const guardianRow = Array.isArray(guardian) ? guardian[0] : guardian;
        return {
          id: row.id,
          kind: row.kind,
          source_type: row.source_type,
          source_id: row.source_id,
          status: row.status,
          context: row.context,
          opened_at: row.opened_at,
          resolved_at: row.resolved_at,
          resolution: row.resolution,
          pet: petRow ? { id: petRow.id ?? row.pet_id, name: petRow.name ?? 'Pet' } : { id: row.pet_id, name: 'Pet' },
          guardian: guardianRow
            ? { id: guardianRow.id ?? row.guardian_id, full_name: guardianRow.full_name ?? 'Tutor', phone: guardianRow.phone ?? null }
            : null,
        };
      });

    return res.json({ date: day, items });
  } catch (e: unknown) {
    console.error('getHubReceptionBoard', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar a recepção' });
  }
};

const resolveBody = z
  .object({
    clinic_id: uuidStr,
    action: z.enum(['entreguei', 'embarquei', 'chegou', 'autorizar', 'dispensar', 'recebi']),
  })
  .strict();

/** POST /reception/handoffs/:id/resolve */
export const postHubReceptionResolve = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const body = resolveBody.safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: 'Dados inválidos' });
    const staffId = await staffIdForUser(body.data.clinic_id, req.user?.id);
    const result = await resolveReceptionHandoff({
      clinicId: body.data.clinic_id,
      handoffId: id.data,
      action: body.data.action,
      staffId,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('postHubReceptionResolve', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao concluir a tarefa' });
  }
};
