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
  /** Campos só UI (não persistidos na API atual). */
  nickname: string;
  isSRD: boolean;
  neutered: '' | 'Y' | 'N';
  coatColor: string;
  coatType: string;
  microchip: string;
  weightKg: string;
  heightCm: string;
  size: string;
  referralSource: string;
  visitsOther: '' | 'Y' | 'N';
  otherObservations: string;
  /** Tags de comportamento (passo 4) — enviadas como behavior_tags na API. */
  behaviorTags: string[];
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
  coatType: '',
  microchip: '',
  weightKg: '',
  heightCm: '',
  size: '',
  referralSource: '',
  visitsOther: '',
  otherObservations: '',
  behaviorTags: [],
});

export const WIZARD_STEPS = [
  'Informações básicas',
  'Saúde e comportamento',
  'Responsáveis',
  'Documentos e observações',
] as const;
