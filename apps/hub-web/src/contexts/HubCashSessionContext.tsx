import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { hubFinancialApi, type HubCashSession } from '@petimi/hub-ui';
import { useHubUnit } from './HubUnitContext';

type HubCashSessionContextValue = {
  cashSession: HubCashSession | null;
  isOpen: boolean;
  openedAt: string | null;
  isPreviousDay: boolean;
  pendingBillingCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

const HubCashSessionContext = createContext<HubCashSessionContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 60_000;

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const HubCashSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { clinicId, selectedUnit } = useHubUnit();
  const unitId = selectedUnit?.id ?? null;

  const [cashSession, setCashSession] = useState<HubCashSession | null>(null);
  const [pendingBillingCount, setPendingBillingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!clinicId || !unitId) {
      setCashSession(null);
      setPendingBillingCount(0);
      return;
    }
    setLoading(true);
    try {
      const statusRes = await hubFinancialApi.getCashSessionStatus(clinicId, unitId);
      setCashSession(statusRes.cash_session ?? null);
      setPendingBillingCount(statusRes.pending_billing_count);
    } catch {
      // Badge de caixa é não-crítico — falha silenciosa
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId]);

  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const isOpen = cashSession?.status === 'open';
  const openedAt = cashSession?.opened_at ?? null;
  const isPreviousDay = openedAt
    ? new Date(openedAt).toISOString().slice(0, 10) < ymdToday()
    : false;

  return (
    <HubCashSessionContext.Provider
      value={{ cashSession, isOpen, openedAt, isPreviousDay, pendingBillingCount, loading, refresh }}
    >
      {children}
    </HubCashSessionContext.Provider>
  );
};

export function useHubCashSession(): HubCashSessionContextValue {
  const ctx = useContext(HubCashSessionContext);
  if (!ctx) throw new Error('useHubCashSession deve ser usado dentro de HubCashSessionProvider');
  return ctx;
}
