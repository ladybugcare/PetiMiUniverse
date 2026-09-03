import type { HubPet } from '../../../api/hubPetsApi';
import { PET_BODY_PORTE_VALUES, type PetBodyPorteValue } from '../../../utils/hubServiceTypesPricingMatrix';
import { initialPetWizardState, type PetWizardState } from './types';

export function petToWizardState(pet: HubPet): PetWizardState {
  const st = pet.size_tier;
  const sizeOk = PET_BODY_PORTE_VALUES.includes(st as PetBodyPorteValue);
  const sex = pet.sex === 'M' || pet.sex === 'F' || pet.sex === 'U' ? pet.sex : '';
  return {
    ...initialPetWizardState(),
    name: pet.name,
    species: pet.species,
    breed: pet.breed?.trim() || '',
    isSRD: !(pet.breed && pet.breed.trim()),
    sex,
    birth_date: pet.birth_date || '',
    notes: pet.notes || '',
    behaviorTags: pet.behavior_tags ?? [],
    size: sizeOk ? st : '',
    coatColor: pet.coat_color || '',
    coatType: pet.coat_type || '',
    primary_guardian_id: pet.primary_guardian?.guardian_id || '',
    secondary_guardian_id: pet.secondary_guardian?.guardian_id || '',
  };
}
