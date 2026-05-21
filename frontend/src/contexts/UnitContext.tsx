import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { Unit } from '../types/units';
import { unitsApi } from '../services/unitsApi';
import { getStoredClinicId } from '../utils/authHelpers';

import { CLINIC_STORAGE_UPDATED_EVENT } from '../constants/appEvents';

interface UnitContextType {
  selectedUnit: Unit | null;
  units: Unit[];
  setSelectedUnit: (unit: Unit) => void;
  loadUnits: () => Promise<void>;
  loading: boolean;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

interface UnitProviderProps {
  children: ReactNode;
}

export const UnitProvider: React.FC<UnitProviderProps> = ({ children }) => {
  const location = useLocation();
  const [selectedUnit, setSelectedUnitState] = useState<Unit | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  /** Evita pedidos GET em paralelo ao mesmo recurso (ex.: 429 em cascata). */
  const loadUnitsInFlightRef = useRef<Promise<void> | null>(null);

  const loadUnits = useCallback(async () => {
    if (loadUnitsInFlightRef.current) {
      return loadUnitsInFlightRef.current;
    }

    const p = (async () => {
      try {
        setLoading(true);
        const userStr = localStorage.getItem('user');
        if (!userStr) {
          setUnits([]);
          setSelectedUnitState(null);
          return;
        }
        try {
          JSON.parse(userStr);
        } catch (error) {
          console.warn('Failed to parse user from localStorage:', error);
          setUnits([]);
          setSelectedUnitState(null);
          return;
        }

        const clinicId: string | null = getStoredClinicId();

        if (!clinicId) {
          setUnits([]);
          setSelectedUnitState(null);
          return;
        }

        const fetchOnce = () => unitsApi.getByClinic(clinicId);

        let result: { units: Unit[] };
        try {
          result = await fetchOnce();
        } catch (first: any) {
          const msg = String(first?.message || '');
          if (msg.includes('429') || msg.includes('Too Many')) {
            await new Promise((r) => setTimeout(r, 2500));
            result = await fetchOnce();
          } else {
            throw first;
          }
        }

        setUnits(result.units);

        const mainUnit = result.units.find((u) => u.is_main) || result.units[0];

        const savedUnitId = localStorage.getItem('selected_unit_id');
        if (savedUnitId) {
          const savedUnit = result.units.find((u) => u.id === savedUnitId);
          if (savedUnit) {
            setSelectedUnitState(savedUnit);
            return;
          }
        }

        setSelectedUnitState(mainUnit || null);
      } catch (error: any) {
        if (error?.message?.includes('403') || error?.message?.includes('404')) {
          setUnits([]);
          setSelectedUnitState(null);
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error loading units:', error);
          }
        }
      } finally {
        setLoading(false);
      }
    })();

    loadUnitsInFlightRef.current = p;
    try {
      await p;
    } finally {
      if (loadUnitsInFlightRef.current === p) {
        loadUnitsInFlightRef.current = null;
      }
    }
  }, []);

  const setSelectedUnit = useCallback((unit: Unit) => {
    setSelectedUnitState(unit);
    localStorage.setItem('selected_unit_id', unit.id);
  }, []);

  // Recarregar ao mudar de rota (ex.: após login ainda com UnitProvider montado desde o arranque)
  useEffect(() => {
    void loadUnits();
  }, [location.pathname, loadUnits]);

  useEffect(() => {
    const onClinicStorageUpdated = () => {
      void loadUnits();
    };
    window.addEventListener(CLINIC_STORAGE_UPDATED_EVENT, onClinicStorageUpdated);
    return () => {
      window.removeEventListener(CLINIC_STORAGE_UPDATED_EVENT, onClinicStorageUpdated);
    };
  }, [loadUnits]);

  const contextValue = useMemo(
    () => ({ selectedUnit, units, setSelectedUnit, loadUnits, loading }),
    [selectedUnit, units, setSelectedUnit, loadUnits, loading]
  );

  return (
    <UnitContext.Provider value={contextValue}>
      {children}
    </UnitContext.Provider>
  );
};

export const useUnit = () => {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error('useUnit must be used within a UnitProvider');
  }
  return context;
};
