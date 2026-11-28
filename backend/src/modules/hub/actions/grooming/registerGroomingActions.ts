import { z } from 'zod';
import { registerAction } from '../registry';
import { toVoiceScope } from '../context';
import {
  GROOMING_ACTION_IDS,
  handleFinishBath,
  handleListPending,
  handleMarkReady,
  handleStartService,
} from './groomingDomain';

const petNameSchema = z.object({
  pet_name: z.string().min(1).optional(),
  confirmed: z.boolean().optional(),
});

let registered = false;

export function resetGroomingActionsRegistrationForTests(): void {
  registered = false;
}

export function registerGroomingActions(): void {
  if (registered) return;
  registered = true;

  registerAction({
    id: GROOMING_ACTION_IDS.list,
    description:
      'Lista pets aguardando ou em atendimento de banho e tosa hoje na unidade. Use this when the user asks who is waiting for a bath or grooming.',
    kind: 'read',
    inputSchema: z.object({}),
    permissions: ['grooming.queue.read'],
    confirmationPolicy: 'none',
    readOnlyHint: true,
    async handler(ctx) {
      return handleListPending(toVoiceScope(ctx));
    },
  });

  registerAction({
    id: GROOMING_ACTION_IDS.start,
    description:
      'Inicia o atendimento de banho/tosa de um pet pelo nome. Use this when the user asks to start a bath or grooming. Does not create appointments.',
    kind: 'write',
    inputSchema: petNameSchema.extend({
      pet_name: z.string().min(1),
    }),
    permissions: ['grooming.queue.manage'],
    confirmationPolicy: 'explicit_command',
    readOnlyHint: false,
    async handler(ctx, input: { pet_name: string }) {
      return handleStartService(toVoiceScope(ctx), input.pet_name.trim());
    },
  });

  registerAction({
    id: GROOMING_ACTION_IDS.markReady,
    description:
      'Marca o atendimento de banho/tosa como pronto. Use this when the user says the pet finished or is ready. Requires confirmed=true after presenting the draft confirmation.',
    kind: 'write',
    inputSchema: petNameSchema.extend({
      pet_name: z.string().min(1),
      confirmed: z.boolean().optional(),
    }),
    permissions: ['grooming.queue.manage'],
    confirmationPolicy: 'explicit_command',
    readOnlyHint: false,
    async handler(ctx, input: { pet_name: string; confirmed?: boolean }) {
      return handleMarkReady(toVoiceScope(ctx), input.pet_name.trim(), Boolean(input.confirmed));
    },
  });

  registerAction({
    id: GROOMING_ACTION_IDS.finishBathHint,
    description:
      'Orienta que o fim do banho deve ser registrado marcando o pet como pronto. Não altera dados.',
    kind: 'read',
    inputSchema: petNameSchema,
    permissions: ['grooming.queue.read'],
    confirmationPolicy: 'none',
    readOnlyHint: true,
    async handler(_ctx, input: { pet_name?: string }) {
      return handleFinishBath(input.pet_name);
    },
  });
}
