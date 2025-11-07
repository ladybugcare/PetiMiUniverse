import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Unit } from '../types/units';
import { unitsApi } from '../services/unitsApi';

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
  const [selectedUnit, setSelectedUnitState] = useState<Unit | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUnits = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user') || '');
      const userRole = user?.user_metadata?.role || user?.role;

      let clinicUser: any = null;
      const clinicUserRaw = localStorage.getItem('clinic_user');
      if (clinicUserRaw) {
        try {
          clinicUser = JSON.parse(clinicUserRaw);
        } catch (error) {
          console.warn('Failed to parse clinic_user from localStorage:', error);
        }
      }

      // Determine clinic_id based on clinic_user or clinic owner
      let clinicId: string | null =
        clinicUser?.clinic_id || (userRole === 'clinic' ? user.id : null);

      if (!clinicId) {
        setUnits([]);
        setSelectedUnitState(null);
        setLoading(false);
        return;
      }

      const result = await unitsApi.getByClinic(clinicId);
      setUnits(result.units);

      // Select main unit by default, or first unit
      const mainUnit = result.units.find((u) => u.is_main) || result.units[0];
      
      // Check if there's a saved unit in localStorage
      const savedUnitId = localStorage.getItem('selected_unit_id');
      if (savedUnitId) {
        const savedUnit = result.units.find((u) => u.id === savedUnitId);
        if (savedUnit) {
          setSelectedUnitState(savedUnit);
          return;
        }
      }

      setSelectedUnitState(mainUnit || null);
    } catch (error) {
      console.error('Error loading units:', error);
    } finally {
      setLoading(false);
    }
  };

  const setSelectedUnit = (unit: Unit) => {
    setSelectedUnitState(unit);
    // Save to localStorage
    localStorage.setItem('selected_unit_id', unit.id);
  };

  useEffect(() => {
    loadUnits();
  }, []);

  return (
    <UnitContext.Provider
      value={{ selectedUnit, units, setSelectedUnit, loadUnits, loading }}
    >
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
