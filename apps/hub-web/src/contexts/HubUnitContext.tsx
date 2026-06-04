import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, CLINIC_STORAGE_UPDATED_EVENT, getStoredClinicId } from '@petimi/web-core';
import { hubUnitsApi } from '../services/hubUnitsApi';
import { applyHubSessionContext, hubSessionApi } from '../services/hubSessionApi';
import { HUB_UNIT_STORAGE_UPDATED_EVENT } from '../constants/hubUnitEvents';
import type { HubUnit } from '../types/hubUnit';

const SELECTED_UNIT_KEY = 'selected_unit_id';

/** Unidades elegíveis para seleção no hub (inclui pendente de aprovação; exclui rejeitada/inativa). */
function filterSelectableUnits(units: HubUnit[]): HubUnit[] {
  return units.filter((u) => {
    const s = (u.status || 'active').toLowerCase();
    if (s === 'rejected' || s === 'inactive' || s === 'suspended') return false;
    return true;
  });
}

type ClinicRow = { name?: string };

type HubUnitContextValue = {
  clinicId: string | null;
  clinicName: string;
  selectedUnit: HubUnit | null;
  units: HubUnit[];
  setSelectedUnit: (unit: HubUnit) => void;
  loading: boolean;
  reload: () => Promise<void>;
};

const HubUnitContext = createContext<HubUnitContextValue | undefined>(undefined);

function getClinicUserUnitId(): string | null {
  try {
    const raw = localStorage.getItem('clinic_user');
    if (!raw) return null;
    const cu = JSON.parse(raw) as { unit_id?: string };
    return cu?.unit_id ? String(cu.unit_id) : null;
  } catch {
    return null;
  }
}

function persistSelectedUnitId(unitId: string): void {
  try {
    if (localStorage.getItem(SELECTED_UNIT_KEY) === unitId) return;
    localStorage.setItem(SELECTED_UNIT_KEY, unitId);
    window.dispatchEvent(new Event(HUB_UNIT_STORAGE_UPDATED_EVENT));
  } catch {
    /* ignore */
  }
}

function pickDefaultUnit(units: HubUnit[]): HubUnit | null {
  if (!units.length) return null;
  const savedId = localStorage.getItem(SELECTED_UNIT_KEY);
  if (savedId) {
    const saved = units.find((u) => u.id === savedId);
    if (saved) return saved;
  }
  const fromMembership = getClinicUserUnitId();
  if (fromMembership) {
    const linked = units.find((u) => u.id === fromMembership);
    if (linked) return linked;
  }
  return units.find((u) => u.is_main) || units[0];
}

export const HubUnitProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [clinicId, setClinicId] = useState<string | null>(() => getStoredClinicId());
  const [clinicName, setClinicName] = useState('');
  const [units, setUnits] = useState<HubUnit[]>([]);
  const [selectedUnit, setSelectedUnitState] = useState<HubUnit | null>(null);
  const [loading, setLoading] = useState(true);
  const loadInFlight = useRef<Promise<void> | null>(null);

  const reload = useCallback(async () => {
    if (loadInFlight.current) return loadInFlight.current;

    const p = (async () => {
      setLoading(true);
      let id = getStoredClinicId();

      if (!id) {
        try {
          const ctx = await hubSessionApi.getContext();
          id = applyHubSessionContext(ctx);
        } catch {
          /* sessão sem clínica ou API indisponível */
        }
      }

      setClinicId(id);

      if (!id) {
        setClinicName('');
        setUnits([]);
        setSelectedUnitState(null);
        setLoading(false);
        return;
      }

      try {
        const [clinicRes, unitsRes] = await Promise.all([
          apiRequest(`/clinics/${encodeURIComponent(id)}`) as Promise<{ clinic?: ClinicRow }>,
          /* activeOnly=false: pending_review não aparece em active+approved e quebrava seleção/localStorage */
          hubUnitsApi.getByClinic(id, false),
        ]);
        const name = clinicRes?.clinic?.name?.trim() || 'Clínica';
        setClinicName(name);
        const raw = unitsRes.units || [];
        const list = filterSelectableUnits(raw);
        setUnits(list);
        setSelectedUnitState((prev) => {
          const next = prev && list.some((u) => u.id === prev.id) ? prev : pickDefaultUnit(list);
          if (next) persistSelectedUnitId(next.id);
          return next;
        });
      } catch {
        setClinicName('Clínica');
        setUnits([]);
        setSelectedUnitState(null);
      } finally {
        setLoading(false);
      }
    })();

    loadInFlight.current = p;
    try {
      await p;
    } finally {
      if (loadInFlight.current === p) loadInFlight.current = null;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onClinicChange = () => void reload();
    window.addEventListener(CLINIC_STORAGE_UPDATED_EVENT, onClinicChange);
    window.addEventListener('storage', onClinicChange);
    return () => {
      window.removeEventListener(CLINIC_STORAGE_UPDATED_EVENT, onClinicChange);
      window.removeEventListener('storage', onClinicChange);
    };
  }, [reload]);

  const setSelectedUnit = useCallback((unit: HubUnit) => {
    setSelectedUnitState(unit);
    persistSelectedUnitId(unit.id);
  }, []);

  const value = useMemo(
    () => ({
      clinicId,
      clinicName,
      selectedUnit,
      units,
      setSelectedUnit,
      loading,
      reload,
    }),
    [clinicId, clinicName, selectedUnit, units, setSelectedUnit, loading, reload],
  );

  return <HubUnitContext.Provider value={value}>{children}</HubUnitContext.Provider>;
};

export function useHubUnit(): HubUnitContextValue {
  const ctx = useContext(HubUnitContext);
  if (!ctx) throw new Error('useHubUnit must be used within HubUnitProvider');
  return ctx;
}
