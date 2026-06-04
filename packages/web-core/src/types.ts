// Tipos de role clinic (staff) — alinhado a frontend/src/types/units.ts
export type ClinicStaffRole = 'CADMIN' | 'CMANAGER' | 'CASSISTANT' | 'CVET_INTERNAL' | 'CGROOMER' | 'CFINANCE';

// Role de app (auth metadata) — alinhado a frontend/src/utils/authHelpers.ts
export type AppRole =
  | 'ADMIN'
  | 'CADMIN'
  | 'CMANAGER'
  | 'CASSISTANT'
  | 'CVET_INTERNAL'
  | 'CGROOMER'
  | 'CFINANCE'
  | 'VET'
  | 'FREELANCER'
  | 'UNKNOWN';
