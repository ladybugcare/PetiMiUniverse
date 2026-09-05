import { describe, expect, it } from 'vitest';
import {
  isInternalSalePurpose,
  filterMedicationItemsForInClinic,
  filterEncounterApplicationServices,
} from './inClinicMedicationCatalog';

describe('inClinicMedicationCatalog', () => {
  it('identifica finalidade INTERNAL', () => {
    expect(isInternalSalePurpose('INTERNAL')).toBe(true);
    expect(isInternalSalePurpose('internal')).toBe(true);
    expect(isInternalSalePurpose('SALE')).toBe(false);
    expect(isInternalSalePurpose('CLINICAL')).toBe(false);
    expect(isInternalSalePurpose(null)).toBe(false);
  });

  it('filtra itens de uso interno da listagem clínica', () => {
    const rows = [
      { id: '1', active: true, sale_purpose: 'SALE' },
      { id: '2', active: true, sale_purpose: 'CLINICAL' },
      { id: '3', active: true, sale_purpose: 'INTERNAL' },
      { id: '4', active: false, sale_purpose: 'SALE' },
    ];
    expect(filterMedicationItemsForInClinic(rows).map((r) => r.id)).toEqual(['1', '2']);
  });

  it('filtra só serviços de aplicação ativos', () => {
    const rows = [
      { id: 'a', active: true, is_encounter_application: true },
      { id: 'b', active: true, is_encounter_application: false },
      { id: 'c', active: false, is_encounter_application: true },
    ];
    expect(filterEncounterApplicationServices(rows).map((r) => r.id)).toEqual(['a']);
  });
});
