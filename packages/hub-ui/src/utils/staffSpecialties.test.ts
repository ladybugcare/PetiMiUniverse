import { describe, expect, it } from 'vitest';
import { parseStaffSpecialties, staffSpecialtiesForApi, specialtyCategoryForJobTitle } from './staffSpecialties';

describe('staffSpecialties', () => {
  it('parseia array da API', () => {
    expect(parseStaffSpecialties(['uuid-1', 'Cardiologia'])).toEqual(['uuid-1', 'Cardiologia']);
  });

  it('parseia JSON legado em text', () => {
    expect(parseStaffSpecialties('["uuid-1","Cardiologia"]')).toEqual(['uuid-1', 'Cardiologia']);
  });

  it('parseia texto legado separado por vírgula', () => {
    expect(parseStaffSpecialties('Cardiologia, Dermatologia')).toEqual(['Cardiologia', 'Dermatologia']);
  });

  it('envia array limpo para a API', () => {
    expect(staffSpecialtiesForApi([' uuid-1 ', '', 'Ortopedia'])).toEqual(['uuid-1', 'Ortopedia']);
  });

  it('mapeia função para categoria do catálogo', () => {
    expect(specialtyCategoryForJobTitle('Médico(a) Veterinário(a)')).toBe('vet');
    expect(specialtyCategoryForJobTitle('Banho & Tosa')).toBe('freelancer');
    expect(specialtyCategoryForJobTitle('Recepção')).toBeUndefined();
  });
});
