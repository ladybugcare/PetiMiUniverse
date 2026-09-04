import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

export const PRESCRIPTION_LOOKUP_KINDS = ['medication', 'presentation', 'use_route'] as const;
export type PrescriptionLookupKind = (typeof PRESCRIPTION_LOOKUP_KINDS)[number];

/** Seeds sugeridos (sempre mesclados na listagem; persistidos só se o usuário criar/selecionar como novo). */
export const DEFAULT_PRESCRIPTION_LOOKUP_LABELS: Record<
  Exclude<PrescriptionLookupKind, 'medication'>,
  readonly string[]
> = {
  presentation: [
    'Comprimido',
    'Cápsula',
    'Suspensão',
    'Solução',
    'Gotas',
    'Pomada',
    'Creme',
    'Gel',
    'Spray',
    'Sache',
    'Ampola',
    'Injetável',
  ],
  use_route: [
    'Oral',
    'Tópico',
    'Oftalmológico',
    'Otológico',
    'Nasal',
    'Injetável (IM)',
    'Injetável (SC)',
    'Injetável (IV)',
    'Retal',
    'Inalatório',
  ],
};

const kindSchema = z.enum(PRESCRIPTION_LOOKUP_KINDS);

function normLabel(s: string): string {
  return s.trim().toLowerCase();
}

function mergeLookupLabels(
  kind: PrescriptionLookupKind,
  rows: Array<{ id: string; label: string }>,
): Array<{ id: string | null; label: string; from_catalog: boolean }> {
  const byNorm = new Map<string, { id: string | null; label: string; from_catalog: boolean }>();
  for (const r of rows) {
    const label = r.label.trim();
    if (!label) continue;
    byNorm.set(normLabel(label), { id: r.id, label, from_catalog: true });
  }
  if (kind === 'presentation' || kind === 'use_route') {
    for (const seed of DEFAULT_PRESCRIPTION_LOOKUP_LABELS[kind]) {
      const key = normLabel(seed);
      if (!byNorm.has(key)) {
        byNorm.set(key, { id: null, label: seed, from_catalog: false });
      }
    }
  }
  return [...byNorm.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export const listHubPrescriptionLookups = async (req: Request, res: Response) => {
  try {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const kindParsed = kindSchema.safeParse(req.query.kind);
    if (!kindParsed.success) {
      return res.status(400).json({ error: 'kind inválido (medication|presentation|use_route)' });
    }
    const clinic_id = clinicParsed.data;
    const kind = kindParsed.data;

    const { data, error } = await supabaseAdmin
      .from('hub_prescription_lookups')
      .select('id, clinic_id, kind, label, created_at, updated_at')
      .eq('clinic_id', clinic_id)
      .eq('kind', kind)
      .is('deleted_at', null)
      .order('label', { ascending: true });

    if (error) {
      console.error('[hub_prescription_lookups] list', error);
      return res.status(500).json({ error: 'Erro ao listar opções de receita' });
    }

    const rows = (data ?? []).map((r) => ({ id: r.id as string, label: String(r.label ?? '') }));

    // Medicamentos já prescritos (snapshot) entram na listagem mesmo sem linha no catálogo.
    if (kind === 'medication') {
      const { data: rxRows, error: rxErr } = await supabaseAdmin
        .from('hub_prescriptions')
        .select('id, hub_prescription_items(medication_name)')
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .limit(500);
      if (!rxErr && rxRows) {
        const seen = new Set(rows.map((r) => normLabel(r.label)));
        for (const rx of rxRows) {
          const items = (rx as { hub_prescription_items?: Array<{ medication_name?: string }> | null })
            .hub_prescription_items;
          if (!Array.isArray(items)) continue;
          for (const it of items) {
            const label = String(it.medication_name ?? '').trim();
            if (!label || seen.has(normLabel(label))) continue;
            seen.add(normLabel(label));
            rows.push({ id: `hist:${label}`, label });
          }
        }
      }
    }

    const lookups = mergeLookupLabels(kind, rows).map((row) => ({
      ...row,
      // ids sintéticos de histórico não são UUID de catálogo
      id: row.id && !String(row.id).startsWith('hist:') ? row.id : null,
      from_catalog: Boolean(row.id && !String(row.id).startsWith('hist:')),
    }));
    return res.json({ kind, lookups });
  } catch (e) {
    console.error('[hub_prescription_lookups] list', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

const createSchema = z
  .object({
    clinic_id: uuidStr,
    kind: kindSchema,
    label: z.string().trim().min(1).max(200),
  })
  .strict();

export const createHubPrescriptionLookup = async (req: Request, res: Response) => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const { clinic_id, kind, label } = body.data;

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('hub_prescription_lookups')
      .select('id, clinic_id, kind, label, created_at, updated_at, deleted_at')
      .eq('clinic_id', clinic_id)
      .eq('kind', kind)
      .is('deleted_at', null)
      .ilike('label', label);

    if (findErr) {
      console.error('[hub_prescription_lookups] find', findErr);
      return res.status(500).json({ error: 'Erro ao verificar opção existente' });
    }

    const match = (existing ?? []).find((r) => normLabel(String(r.label)) === normLabel(label));
    if (match) {
      return res.status(200).json({ lookup: match, created: false });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_prescription_lookups')
      .insert([{ clinic_id, kind, label, deleted_at: null }])
      .select('id, clinic_id, kind, label, created_at, updated_at')
      .single();

    if (error) {
      // Concorrência / índice único: tenta devolver o existente
      if (error.code === '23505') {
        const { data: again } = await supabaseAdmin
          .from('hub_prescription_lookups')
          .select('id, clinic_id, kind, label, created_at, updated_at')
          .eq('clinic_id', clinic_id)
          .eq('kind', kind)
          .is('deleted_at', null)
          .ilike('label', label)
          .maybeSingle();
        if (again) return res.status(200).json({ lookup: again, created: false });
      }
      console.error('[hub_prescription_lookups] create', error);
      return res.status(500).json({ error: 'Erro ao criar opção de receita' });
    }

    return res.status(201).json({ lookup: data, created: true });
  } catch (e) {
    console.error('[hub_prescription_lookups] create', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
