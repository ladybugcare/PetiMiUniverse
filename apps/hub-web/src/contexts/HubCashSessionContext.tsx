import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  HUB_CASH_SESSION_UPDATED_EVENT,
  hubFinancialApi,
  type HubCashSession,
} from '@petimi/hub-ui';
import { usePermissions } from '@petimi/web-core';
import { useHubUnit } from './HubUnitContext';

export type HubCashSessionStatusSnapshot = {
  isOpen: boolean;
  pendingBillingCount: number;
};

type HubCashSessionContextValue = {
  cashSession: HubCashSession | null;
  isOpen: boolean;
  openedAt: string | null;
  isPreviousDay: boolean;
  pendingBillingCount: number;
  loading: boolean;
  refresh: () => Promise<HubCashSessionStatusSnapshot | null>;
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
  const { hasPermission, loading: permLoading } = usePermissions();
  const canReadCash =
    !permLoading &&
    (hasPermission('hub.financial.read') ||
      hasPermission('hub.cash.session') ||
      hasPermission('hub.receivables.create'));

  const [cashSession, setCashSession] = useState<HubCashSession | null>(null);
  const [pendingBillingCount, setPendingBillingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (): Promise<HubCashSessionStatusSnapshot | null> => {
    if (!clinicId || !unitId || !canReadCash) {
      setCashSession(null);
      setPendingBillingCount(0);
      return { isOpen: false, pendingBillingCount: 0 };
    }
    setLoading(true);
    try {
      const statusRes = await hubFinancialApi.getCashSessionStatus(clinicId, unitId);
      const session = statusRes.cash_session ?? null;
      setCashSession(session);
      setPendingBillingCount(statusRes.pending_billing_count);
      return {
        isOpen: session?.status === 'open',
        pendingBillingCount: statusRes.pending_billing_count,
      };
    } catch {
      // Badge de caixa é não-crítico — falha silenciosa
      return null;
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, canReadCash]);

  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    const onCashSessionUpdated = () => {
      void refresh();
    };
    window.addEventListener(HUB_CASH_SESSION_UPDATED_EVENT, onCashSessionUpdated);
    return () => window.removeEventListener(HUB_CASH_SESSION_UPDATED_EVENT, onCashSessionUpdated);
  }, [refresh]);

  const isOpen = cashSession?.status === 'open';
  const openedAt = cashSession?.opened_at ?? null;
  const isPreviousDay = openedAt
    ? new Date(openedAt).toISOString().slice(0, 10) < ymdToday()
    : false;

  const value: HubCashSessionContextValue = {
    cashSession,
    isOpen,
    openedAt,
    isPreviousDay,
    pendingBillingCount,
    loading,
    refresh,
  };

  return (
    <HubCashSessionContext.Provider value={value}>{children}</HubCashSessionContext.Provider>
  );
};

const FALLBACK_CASH_SESSION: HubCashSessionContextValue = {
  cashSession: null,
  isOpen: false,
  openedAt: null,
  isPreviousDay: false,
  pendingBillingCount: 0,
  loading: false,
  refresh: async () => ({ isOpen: false, pendingBillingCount: 0 }),
};

export function useHubCashSession(): HubCashSessionContextValue {
  const ctx = useContext(HubCashSessionContext);
  if (!ctx) {
    // Evita derrubar o app (ex.: HMR com identidade de contexto desatualizada).
    // Em uso normal o Provider sempre envolve o shell.
    if (typeof console !== 'undefined') {
      console.warn('useHubCashSession: contexto ausente — usando fallback (verifique HubCashSessionProvider).');
    }
    return FALLBACK_CASH_SESSION;
  }
  return ctx;
}
