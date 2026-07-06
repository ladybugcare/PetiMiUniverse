import { useCallback, useEffect, useRef } from 'react';
import { hubEncountersApi } from '../api/hubClinicalApi';

export function useDebouncedSave(
  encounterId: string | undefined,
  clinicId: string | null,
  canWrite: boolean,
  onSaved: () => void,
  debounceMs = 700,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  const flush = useCallback(async (): Promise<'saved' | 'empty' | 'error'> => {
    if (!encounterId || !clinicId || !canWrite) return 'empty';
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const keys = Object.keys(pending.current);
    if (keys.length === 0) return 'empty';
    const body = { ...pending.current, clinic_id: clinicId };
    pending.current = {};
    try {
      await hubEncountersApi.patch(encounterId, body);
      onSaved();
      return 'saved';
    } catch {
      pending.current = { ...body, ...pending.current };
      delete pending.current.clinic_id;
      return 'error';
    }
  }, [encounterId, clinicId, canWrite, onSaved]);

  const queue = useCallback(
    (patch: Record<string, unknown>) => {
      if (!canWrite) return;
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, debounceMs);
    },
    [canWrite, flush, debounceMs],
  );

  useEffect(() => {
    const onOnline = () => {
      if (Object.keys(pending.current).length > 0) void flush();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  return { queue, flush };
}
