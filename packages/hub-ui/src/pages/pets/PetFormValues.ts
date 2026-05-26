export type PetFormValues = {
  name: string;
  species: string;
  breed: string;
  sex: '' | 'M' | 'F' | 'U';
  birth_date: string;
  notes: string;
  primary_guardian_id: string;
  secondary_guardian_id: string;
};

export const emptyPetForm: PetFormValues = {
  name: '',
  species: '',
  breed: '',
  sex: '',
  birth_date: '',
  notes: '',
  primary_guardian_id: '',
  secondary_guardian_id: '',
};
