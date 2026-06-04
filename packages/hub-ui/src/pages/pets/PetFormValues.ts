import type { CoatTypeValue, PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';

export type PetFormValues = {
  name: string;
  species: string;
  breed: string;
  /** Sem raça definida (SRD) — alinhado ao wizard; envio API usa `breed: null`. */
  isSRD: boolean;
  sex: '' | 'M' | 'F' | 'U';
  birth_date: string;
  notes: string;
  /** Porte corporal (mini…gigante); vazio resolve para sugestão por raça ou médio no envio. */
  size_tier: '' | PetBodyPorteValue;
  coat_color: string;
  coat_type: '' | CoatTypeValue;
  primary_guardian_id: string;
  secondary_guardian_id: string;
};

export const emptyPetForm: PetFormValues = {
  name: '',
  species: '',
  breed: '',
  isSRD: false,
  sex: '',
  birth_date: '',
  notes: '',
  size_tier: '',
  coat_color: '',
  coat_type: '',
  primary_guardian_id: '',
  secondary_guardian_id: '',
};
