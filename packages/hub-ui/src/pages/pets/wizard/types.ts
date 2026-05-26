/** Estado do wizard; só `api*` é enviado ao `hubPetsApi.create`. */
export type PetWizardState = {
  name: string;
  species: string;
  breed: string;
  sex: '' | 'M' | 'F' | 'U';
  birth_date: string;
  notes: string;
  primary_guardian_id: string;
  secondary_guardian_id: string;
  /** Campos só UI (não persistidos na API actual). */
  nickname: string;
  isSRD: boolean;
  neutered: '' | 'Y' | 'N';
  coatColor: string;
  microchip: string;
  weightKg: string;
  heightCm: string;
  size: string;
  referralSource: string;
  visitsOther: '' | 'Y' | 'N';
  otherObservations: string;
};

export const initialPetWizardState = (): PetWizardState => ({
  name: '',
  species: '',
  breed: '',
  sex: '',
  birth_date: '',
  notes: '',
  primary_guardian_id: '',
  secondary_guardian_id: '',
  nickname: '',
  isSRD: false,
  neutered: '',
  coatColor: '',
  microchip: '',
  weightKg: '',
  heightCm: '',
  size: '',
  referralSource: '',
  visitsOther: '',
  otherObservations: '',
});

export const WIZARD_STEPS = [
  'Informações básicas',
  'Saúde e comportamento',
  'Responsáveis',
  'Documentos e observações',
] as const;
