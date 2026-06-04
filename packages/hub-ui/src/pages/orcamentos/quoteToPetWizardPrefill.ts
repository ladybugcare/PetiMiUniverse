import type { HubQuotePet } from '../../api/hubQuotesApi';
import type { PetWizardState } from '../pets/wizard/types';

/** Pré-preenche o wizard a partir de uma linha `hub_quote_pets` (data de nascimento fica vazia — confirmar na UI). */
export function prefillPetWizardFromQuotePet(pet: HubQuotePet): Partial<PetWizardState> {
  const name = (pet.display_name && pet.display_name.trim()) || '';
  const st = pet.size_tier;
  const sizeOk = st === 'mini' || st === 'pequeno' || st === 'medio' || st === 'grande' || st === 'gigante';
  return {
    name,
    species: pet.species?.trim() || '',
    breed: pet.breed?.trim() || '',
    isSRD: false,
    sex: pet.sex ?? '',
    size: sizeOk ? st : '',
    coatType: pet.coat_type?.trim() || '',
    birth_date: '',
  };
}
