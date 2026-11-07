import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@petimi/web-core';
import { hubBoardingApi, type BoardingOpsBoardResponse } from '../../api/hubBoardingApi';
import { useAlert } from '../../components/AlertProvider';

const POLL_MS = 30_000;
const REALTIME_TABLES = ['hub_boarding_reservations', 'hub_boarding_tasks', 'hub_boarding_incidents'] as const;

/** Painel do dia (presentes, tarefas, ocupação) com polling e realtime. */
export function useBoardingOpsBoard(args: {
  clinicId: string | null;
  unitId?: string;
  dateYmd: string;
  enabled: boolean;
  channelKey: string;
}) {
  const { clinicId, unitId, dateYmd, enabled, channelKey } = args;
  const { showError } = useAlert();
  const [board, setBoard] = useState<BoardingOpsBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seqRef = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!clinicId) return;
      const seq = ++seqRef.current;
      if (opts?.soft || hasDataRef.current) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await hubBoardingApi.opsBoard(clinicId, { unitId, dateYmd });
        if (seq !== seqRef.current) return;
        setBoard(res);
        hasDataRef.current = true;
      } catch (e: unknown) {
        if (seq !== seqRef.current) return;
        if (!opts?.soft) showError((e as Error)?.message || 'Erro ao carregar Hotel & Creche');
      } finally {
        if (seq === seqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [clinicId, unitId, dateYmd, showError],
  );

  useEffect(() => {
    hasDataRef.current = false;
    setBoard(null);
  }, [clinicId, unitId, dateYmd]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void load({ soft: true }), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !clinicId) return;
    const supabase = getSupabase();
    if (!supabase) return;
    // Registro em lote gera várias linhas de uma vez: agrupa os eventos.
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load({ soft: true }), 800);
    };
    let channel = supabase.channel(`${channelKey}_${clinicId}`);
    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `clinic_id=eq.${clinicId}` },
        schedule,
      );
    }
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, clinicId, channelKey, load]);

  return { board, loading, refreshing, reload: load };
}
