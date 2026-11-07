import { useState } from 'react';
import { hubBoardingApi, type BoardingTask } from '../../api/hubBoardingApi';
import { useAlert } from '../../components/AlertProvider';
import type { BoardingTaskAction } from './BoardingTaskList';

/** Registro de resultado de tarefa (um toque) com feedback padrão do Hub. */
export function useBoardingTaskRunner(clinicId: string | null, onDone?: () => void | Promise<void>) {
  const { showError } = useAlert();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const run = async (task: BoardingTask, action: BoardingTaskAction) => {
    if (!clinicId) return;
    setBusyTaskId(task.id);
    try {
      await hubBoardingApi.executeTask(task.id, {
        clinic_id: clinicId,
        ...(action.type === 'outcome'
          ? { outcome: action.outcome, notes: action.notes ?? null }
          : action.type === 'skip'
            ? { skip: true, notes: action.notes ?? null }
            : { undo: true }),
      });
      await onDone?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar a tarefa');
    } finally {
      setBusyTaskId(null);
    }
  };

  return { busyTaskId, run };
}
