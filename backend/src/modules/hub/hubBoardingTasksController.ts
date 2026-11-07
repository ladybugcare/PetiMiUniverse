import crypto from 'crypto';
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import {
  BATCH_TASK_KINDS,
  canJoinGroupRecreation,
  isTaskOverdue,
  isValidOutcome,
  normalizeHandling,
} from './boardingCare';
import { boardingLocalParts } from './boardingBilling';
import { BOARDING_MIGRATION_HINT, loadReservation, missingTable, type ReservationRow } from './boardingCareService';
import { UUID_RE } from './hubBoardingDrawerController';
import { batchActivitySchema, createTaskSchema, executeTaskSchema, tasksQuerySchema } from './hubBoardingSchemas';
import { todayYmdSaoPaulo } from './boardingPricing';

const DEFAULT_BATCH_TITLES: Record<string, string> = {
  recreation: 'Recreação',
  walk: 'Passeio',
  custom: 'Atividade',
};

function ymdOf(iso: string): string {
  return boardingLocalParts(iso)?.ymd ?? iso.slice(0, 10);
}

// ─── GET /boarding/tasks ──────────────────────────────────────────────────

export const getHubBoardingTasks = async (req: Request, res: Response) => {
  try {
    const parsed = tasksQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, reservation_id } = parsed.data;
    const date = parsed.data.date ?? todayYmdSaoPaulo();

    let q = supabaseAdmin
      .from('hub_boarding_tasks')
      .select('*')
      .eq('clinic_id', clinic_id)
      .order('scheduled_for', { ascending: true, nullsFirst: false });
    if (reservation_id) q = q.eq('hub_boarding_reservation_id', reservation_id);
    else q = q.eq('task_date', date);
    const { data, error } = await q;
    if (error) {
      if (missingTable(error)) return res.json({ tasks: [], migrations_ready: false });
      return res.status(500).json({ error: error.message });
    }
    let tasks = (data ?? []) as Array<Record<string, unknown>>;

    const rsvIds = [...new Set(tasks.map((t) => t.hub_boarding_reservation_id as string))];
    const { data: rsvs } = rsvIds.length
      ? await supabaseAdmin
          .from('hub_boarding_reservations')
          .select('id, unit_id, mode, status, pet_id')
          .in('id', rsvIds)
          .is('deleted_at', null)
      : { data: [] as Array<Record<string, unknown>> };
    const rsvById = new Map((rsvs ?? []).map((r) => [r.id as string, r]));
    tasks = tasks.filter((t) => {
      const r = rsvById.get(t.hub_boarding_reservation_id as string);
      if (!r) return false;
      if (unit_id && r.unit_id !== unit_id) return false;
      return r.status !== 'cancelled' && r.status !== 'no_show';
    });

    const now = Date.now();
    return res.json({
      tasks: tasks.map((t) => ({
        ...t,
        overdue: isTaskOverdue({ status: String(t.status), scheduled_for: (t.scheduled_for as string | null) ?? null }, now),
        reservation_status: rsvById.get(t.hub_boarding_reservation_id as string)?.status ?? null,
        mode: rsvById.get(t.hub_boarding_reservation_id as string)?.mode ?? null,
      })),
      date,
      migrations_ready: true,
    });
  } catch (e: unknown) {
    console.error('getHubBoardingTasks', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar tarefas' });
  }
};

// ─── POST /boarding/reservations/:id/tasks (avulsa) ───────────────────────

export const postHubBoardingTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, kind, title, scheduled_for, notes } = parsed.data;

    const reservation = await loadReservation(clinic_id, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (!['reserved', 'checked_in'].includes(reservation.status)) {
      return res.status(422).json({ error: 'Só é possível criar tarefas para estadias ativas' });
    }

    const when = scheduled_for ?? new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_tasks')
      .insert({
        clinic_id,
        hub_boarding_reservation_id: id,
        pet_id: reservation.pet_id,
        kind,
        source: 'manual',
        title: title.trim(),
        details: notes?.trim() ? { notes: notes.trim() } : {},
        scheduled_for: when,
        task_date: ymdOf(when),
        created_by_user_id: req.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) {
      if (missingTable(error)) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ task: data });
  } catch (e: unknown) {
    console.error('postHubBoardingTask', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar tarefa' });
  }
};

// ─── POST /boarding/tasks/:id/execute ─────────────────────────────────────

export const postHubBoardingTaskExecute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'Tarefa inválida' });
    const parsed = executeTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, outcome, skip, undo, notes, executed_at } = parsed.data;

    const { data: task, error: tErr } = await supabaseAdmin
      .from('hub_boarding_tasks')
      .select('*')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .maybeSingle();
    if (tErr) {
      if (missingTable(tErr)) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });
      return res.status(500).json({ error: tErr.message });
    }
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    const reservation = await loadReservation(clinic_id, task.hub_boarding_reservation_id as string);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status !== 'checked_in' && reservation.status !== 'checked_out') {
      return res.status(422).json({ error: 'Registre as tarefas depois do check-in' });
    }

    const userId = req.user?.id ?? null;
    const at = executed_at ?? new Date().toISOString();
    let update: Record<string, unknown>;
    let execOutcome: string | null = null;
    if (undo) {
      update = { status: 'pending', outcome: null, executed_at: null, executed_by_user_id: null, last_notes: null };
    } else if (skip) {
      update = { status: 'skipped', outcome: null, executed_at: at, executed_by_user_id: userId, last_notes: notes?.trim() || null };
    } else {
      if (!outcome || !isValidOutcome(String(task.kind), outcome)) {
        return res.status(400).json({ error: 'Resultado inválido para esta tarefa' });
      }
      execOutcome = outcome;
      update = { status: 'done', outcome, executed_at: at, executed_by_user_id: userId, last_notes: notes?.trim() || null };
    }

    const { data: saved, error: upErr } = await supabaseAdmin
      .from('hub_boarding_tasks')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (upErr) return res.status(500).json({ error: upErr.message });

    await supabaseAdmin.from('hub_boarding_task_executions').insert({
      clinic_id,
      hub_boarding_task_id: id,
      hub_boarding_reservation_id: reservation.id,
      outcome: skip ? 'skipped' : execOutcome,
      undone: Boolean(undo),
      notes: notes?.trim() || null,
      executed_at: at,
      executed_by_user_id: userId,
    });

    return res.json({ task: saved });
  } catch (e: unknown) {
    console.error('postHubBoardingTaskExecute', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao registrar tarefa' });
  }
};

// ─── POST /boarding/tasks/batch-activity ──────────────────────────────────

/**
 * Atividade coletiva (recreação, passeio em grupo): um registro individual por pet.
 * Alimentação e medicação nunca entram aqui.
 */
export const postHubBoardingBatchActivity = async (req: Request, res: Response) => {
  try {
    const parsed = batchActivitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, reservation_ids, kind, title, outcome, notes } = parsed.data;
    if (!BATCH_TASK_KINDS.includes(kind)) {
      return res.status(400).json({ error: 'Alimentação e medicação precisam de registro individual' });
    }
    const at = parsed.data.executed_at ?? new Date().toISOString();
    const atMs = new Date(at).getTime();
    const date = ymdOf(at);
    const userId = req.user?.id ?? null;
    const batchId = crypto.randomUUID();

    const { data: rsvs, error: rErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('*')
      .eq('clinic_id', clinic_id)
      .in('id', reservation_ids)
      .is('deleted_at', null);
    if (rErr) return res.status(500).json({ error: rErr.message });
    const reservations = (rsvs ?? []) as ReservationRow[];

    const [{ data: plans }, { data: pending, error: pErr }, { data: pets }] = await Promise.all([
      supabaseAdmin
        .from('hub_boarding_care_plans')
        .select('hub_boarding_reservation_id, handling')
        .in('hub_boarding_reservation_id', reservation_ids),
      supabaseAdmin
        .from('hub_boarding_tasks')
        .select('id, hub_boarding_reservation_id, scheduled_for')
        .eq('clinic_id', clinic_id)
        .in('hub_boarding_reservation_id', reservation_ids)
        .eq('kind', kind)
        .eq('task_date', date)
        .eq('status', 'pending'),
      supabaseAdmin.from('hub_pets').select('id, name').in('id', reservations.map((r) => r.pet_id)),
    ]);
    if (pErr) {
      if (missingTable(pErr)) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });
      return res.status(500).json({ error: pErr.message });
    }
    const handlingByRsv = new Map(
      (plans ?? []).map((p) => [p.hub_boarding_reservation_id as string, normalizeHandling(p.handling)]),
    );
    const petName = new Map((pets ?? []).map((p) => [p.id as string, String(p.name)]));

    const done: Array<{ reservation_id: string; task_id: string }> = [];
    const skipped: Array<{ reservation_id: string; pet_name: string; reason: string }> = [];

    for (const rid of reservation_ids) {
      const r = reservations.find((x) => x.id === rid);
      if (!r) {
        skipped.push({ reservation_id: rid, pet_name: '', reason: 'Reserva não encontrada' });
        continue;
      }
      const name = petName.get(r.pet_id) ?? 'Pet';
      if (r.status !== 'checked_in') {
        skipped.push({ reservation_id: rid, pet_name: name, reason: 'Não está hospedado agora' });
        continue;
      }
      if (kind === 'recreation' && !canJoinGroupRecreation(handlingByRsv.get(rid))) {
        skipped.push({ reservation_id: rid, pet_name: name, reason: 'Manejo não permite recreação em grupo' });
        continue;
      }

      // Usa a tarefa programada mais próxima (até 3h de diferença); senão cria uma do lote.
      const candidates = (pending ?? [])
        .filter((t) => t.hub_boarding_reservation_id === rid)
        .map((t) => ({ id: t.id as string, diff: Math.abs(new Date((t.scheduled_for as string) ?? at).getTime() - atMs) }))
        .filter((t) => t.diff <= 3 * 3600_000)
        .sort((a, b) => a.diff - b.diff);

      let taskId = candidates[0]?.id ?? null;
      const doneFields = {
        status: 'done',
        outcome,
        executed_at: at,
        executed_by_user_id: userId,
        last_notes: notes?.trim() || null,
      };
      if (taskId) {
        const { error } = await supabaseAdmin.from('hub_boarding_tasks').update(doneFields).eq('id', taskId);
        if (error) {
          skipped.push({ reservation_id: rid, pet_name: name, reason: error.message });
          continue;
        }
      } else {
        const { data: created, error } = await supabaseAdmin
          .from('hub_boarding_tasks')
          .insert({
            clinic_id,
            hub_boarding_reservation_id: rid,
            pet_id: r.pet_id,
            kind,
            source: 'batch',
            title: title?.trim() || DEFAULT_BATCH_TITLES[kind],
            details: {},
            scheduled_for: at,
            task_date: date,
            created_by_user_id: userId,
            ...doneFields,
          })
          .select('id')
          .single();
        if (error || !created) {
          skipped.push({ reservation_id: rid, pet_name: name, reason: error?.message ?? 'Erro ao registrar' });
          continue;
        }
        taskId = created.id as string;
      }
      await supabaseAdmin.from('hub_boarding_task_executions').insert({
        clinic_id,
        hub_boarding_task_id: taskId,
        hub_boarding_reservation_id: rid,
        outcome,
        notes: notes?.trim() || null,
        batch_id: batchId,
        executed_at: at,
        executed_by_user_id: userId,
      });
      done.push({ reservation_id: rid, task_id: taskId });
    }

    return res.json({ done, skipped, batch_id: batchId });
  } catch (e: unknown) {
    console.error('postHubBoardingBatchActivity', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao registrar atividade em grupo' });
  }
};
