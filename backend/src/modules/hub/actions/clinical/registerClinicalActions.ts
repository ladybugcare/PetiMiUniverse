import { z } from 'zod';
import { registerAction } from '../registry';
import { createConfirmation, consumeConfirmation } from '../confirmationStore';
import {
  applyEncounterClinicalPatch,
  findOpenEncounterByPetName,
} from './encounterClinicalPatch';

const CLINICAL_IDS = {
  getActive: 'clinical.get_active_encounter',
  prepare: 'clinical.prepare_anamnesis_draft',
  confirm: 'clinical.confirm_save_anamnesis',
} as const;

const structuredFieldsSchema = z.object({
  pet_name: z.string().min(1),
  tutor_report: z
    .string()
    .optional()
    .describe('Relato do tutor em texto livre (ex.: vômitos, diarreia, apetite)'),
  veterinarian_notes: z.string().optional().describe('Observações do veterinário'),
  history: z.string().optional(),
  chief_complaint: z.string().optional(),
  chief_complaint_detail: z.string().optional(),
  appetite_reduced: z.boolean().optional(),
  temperature_c: z.union([z.number(), z.string()]).optional(),
  heart_rate: z.union([z.number(), z.string()]).optional(),
  respiratory_rate: z.union([z.number(), z.string()]).optional(),
  weight_kg: z.union([z.number(), z.string()]).optional(),
});

function buildSoapDraft(input: z.infer<typeof structuredFieldsSchema>): {
  chief_complaint?: string;
  anamnesis: Record<string, unknown>;
  physical_exam: Record<string, unknown>;
  human_summary: string;
} {
  const anamnesis: Record<string, unknown> = {};
  const physical_exam: Record<string, unknown> = {};
  const parts: string[] = [];

  const historyBits: string[] = [];
  if (input.tutor_report?.trim()) {
    historyBits.push(`Relato do tutor: ${input.tutor_report.trim()}`);
  }
  if (input.history?.trim()) historyBits.push(input.history.trim());
  if (input.veterinarian_notes?.trim()) {
    anamnesis.behavior = input.veterinarian_notes.trim();
    parts.push(`Obs. veterinário: ${input.veterinarian_notes.trim()}`);
  }
  if (historyBits.length) {
    anamnesis.history = historyBits.join('\n');
    parts.push(anamnesis.history as string);
  }
  if (input.chief_complaint_detail?.trim()) {
    anamnesis.chief_complaint_detail = input.chief_complaint_detail.trim();
  }
  if (input.appetite_reduced) {
    anamnesis.diet_types = ['inapetente'];
    parts.push('Apetite reduzido (chip inapetente)');
  }

  if (input.temperature_c !== undefined) {
    physical_exam.temperature_c = input.temperature_c;
    parts.push(`Temp ${input.temperature_c}°C`);
  }
  if (input.heart_rate !== undefined) {
    physical_exam.heart_rate = input.heart_rate;
    parts.push(`FC ${input.heart_rate}`);
  }
  if (input.respiratory_rate !== undefined) {
    physical_exam.respiratory_rate = input.respiratory_rate;
    parts.push(`FR ${input.respiratory_rate}`);
  }
  if (input.weight_kg !== undefined) {
    physical_exam.weight_kg = input.weight_kg;
    parts.push(`Peso ${input.weight_kg} kg`);
  }

  return {
    chief_complaint: input.chief_complaint?.trim() || undefined,
    anamnesis,
    physical_exam,
    human_summary: parts.join(' · ') || 'Sem campos estruturados informados.',
  };
}

let registered = false;

export function resetClinicalActionsRegistrationForTests(): void {
  registered = false;
}

export function registerClinicalActions(): void {
  if (registered) return;
  registered = true;

  registerAction({
    id: CLINICAL_IDS.getActive,
    description:
      'Localiza o atendimento clínico aberto (waiting/in_progress) de um pet pelo nome na unidade conectada.',
    kind: 'read',
    inputSchema: z.object({ pet_name: z.string().min(1) }),
    permissions: ['hub.clinic.read'],
    confirmationPolicy: 'none',
    readOnlyHint: true,
    async handler(ctx, input: { pet_name: string }) {
      const found = await findOpenEncounterByPetName({
        clinicId: ctx.clinicId,
        unitId: ctx.unitId,
        petName: input.pet_name,
      });
      if (found.kind === 'error') {
        return { status: 'temporarily_unavailable', message: found.message };
      }
      if (found.kind === 'none') {
        return {
          status: 'not_found',
          message: `Não encontrei atendimento clínico aberto para ${input.pet_name}.`,
          petName: input.pet_name,
        };
      }
      if (found.kind === 'homonyms') {
        return {
          status: 'needs_disambiguation',
          message: 'Há mais de um pet com esse nome em atendimento. Esclareça qual.',
          data: { candidates: found.pets },
          petName: input.pet_name,
        };
      }
      return {
        status: 'executed',
        message: `${found.petName}: atendimento ${found.status}.`,
        encounterId: found.encounterId,
        petName: found.petName,
        data: { pet_id: found.petId, status: found.status },
      };
    },
  });

  registerAction({
    id: CLINICAL_IDS.prepare,
    description:
      'Monta um rascunho estruturado de anamnese/sinais vitais a partir do que o profissional informou. NÃO salva. Nunca invente campos não informados. Use this before saving clinical notes.',
    kind: 'write',
    inputSchema: structuredFieldsSchema,
    permissions: ['hub.clinic.write'],
    confirmationPolicy: 'server_challenge',
    readOnlyHint: false,
    async handler(ctx, input: z.infer<typeof structuredFieldsSchema>) {
      const found = await findOpenEncounterByPetName({
        clinicId: ctx.clinicId,
        unitId: ctx.unitId,
        petName: input.pet_name,
      });
      if (found.kind === 'error') {
        return { status: 'temporarily_unavailable', message: found.message };
      }
      if (found.kind === 'none') {
        return {
          status: 'not_found',
          message: `Não há atendimento clínico aberto para ${input.pet_name}. Não criarei um novo automaticamente.`,
          petName: input.pet_name,
        };
      }
      if (found.kind === 'homonyms') {
        return {
          status: 'needs_disambiguation',
          message: 'Há mais de um pet com esse nome. Esclareça antes de montar o rascunho.',
          data: { candidates: found.pets },
        };
      }

      const draft = buildSoapDraft(input);
      const payload = {
        encounter_id: found.encounterId,
        pet_id: found.petId,
        pet_name: found.petName,
        chief_complaint: draft.chief_complaint ?? null,
        anamnesis: draft.anamnesis,
        physical_exam: draft.physical_exam,
      };
      const confirmation = await createConfirmation({
        userId: ctx.userId,
        clinicId: ctx.clinicId,
        unitId: ctx.unitId,
        actionId: CLINICAL_IDS.confirm,
        payload,
        entityIds: { encounter_id: found.encounterId, pet_id: found.petId },
      });

      return {
        status: 'needs_confirmation',
        message: `Rascunho para ${found.petName}: ${draft.human_summary}. Confirme com clinical.confirm_save_anamnesis usando confirmation_id.`,
        encounterId: found.encounterId,
        petName: found.petName,
        confirmationId: confirmation.id,
        data: {
          draft: payload,
          confirmation_id: confirmation.id,
          expires_at: confirmation.expiresAt,
          human_summary: draft.human_summary,
        },
      };
    },
  });

  registerAction({
    id: CLINICAL_IDS.confirm,
    description:
      'Persiste o rascunho clínico previamente preparado. Exige confirmation_id e o mesmo payload confirmado. Não inventa dados.',
    kind: 'write',
    inputSchema: z.object({
      confirmation_id: z.string().uuid(),
      encounter_id: z.string().uuid(),
      pet_id: z.string().uuid(),
      pet_name: z.string().min(1),
      chief_complaint: z.string().nullable().optional(),
      anamnesis: z.record(z.string(), z.unknown()),
      physical_exam: z.record(z.string(), z.unknown()),
    }),
    permissions: ['hub.clinic.write'],
    confirmationPolicy: 'server_challenge',
    readOnlyHint: false,
    async handler(ctx, input: {
      confirmation_id: string;
      encounter_id: string;
      pet_id: string;
      pet_name: string;
      chief_complaint?: string | null;
      anamnesis: Record<string, unknown>;
      physical_exam: Record<string, unknown>;
    }) {
      const payload = {
        encounter_id: input.encounter_id,
        pet_id: input.pet_id,
        pet_name: input.pet_name,
        chief_complaint: input.chief_complaint ?? null,
        anamnesis: input.anamnesis,
        physical_exam: input.physical_exam,
      };
      const consumed = await consumeConfirmation({
        confirmationId: input.confirmation_id,
        userId: ctx.userId,
        clinicId: ctx.clinicId,
        unitId: ctx.unitId,
        actionId: CLINICAL_IDS.confirm,
        payload,
      });
      if (!consumed.ok) {
        const messages = {
          not_found: 'Confirmação não encontrada.',
          expired: 'Confirmação expirada. Prepare o rascunho novamente.',
          mismatch: 'O conteúdo diverge do rascunho confirmado. Prepare novamente.',
          consumed: 'Esta confirmação já foi utilizada.',
        } as const;
        return { status: 'invalid_state', message: messages[consumed.reason] };
      }

      const applied = await applyEncounterClinicalPatch({
        clinicId: ctx.clinicId,
        encounterId: input.encounter_id,
        patch: {
          chief_complaint: input.chief_complaint,
          anamnesis: input.anamnesis,
          physical_exam: input.physical_exam,
        },
        actorUserId: ctx.userId,
        source: ctx.provider,
      });
      if (!applied.ok) {
        return {
          status: applied.status === 'not_found' ? 'not_found' : applied.status === 'invalid_state' ? 'invalid_state' : 'temporarily_unavailable',
          message: applied.message,
          encounterId: input.encounter_id,
          petName: input.pet_name,
        };
      }

      return {
        status: 'executed',
        message: `Anamnese/exame de ${input.pet_name} salvos no atendimento.`,
        encounterId: applied.encounterId,
        petName: input.pet_name,
        data: {
          anamnesis: applied.anamnesis,
          physical_exam: applied.physical_exam,
          chief_complaint: applied.chief_complaint,
          source: ctx.provider,
        },
      };
    },
  });
}
