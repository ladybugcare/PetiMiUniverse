/** Opções fixas para o wizard de cadastro de pet (dropdowns). */

export type WizardSelectOption = { value: string; label: string };

export const WIZARD_SPECIES_OPTIONS: WizardSelectOption[] = [
  { value: '', label: 'Selecionar…' },
  { value: 'Cão', label: 'Cão' },
  { value: 'Gato', label: 'Gato' },
  { value: 'Ave', label: 'Ave' },
  { value: 'Roedor', label: 'Roedor' },
  { value: 'Réptil', label: 'Réptil' },
  { value: 'Coelho', label: 'Coelho' },
  { value: 'Furão', label: 'Furão' },
  { value: 'Peixe', label: 'Peixe' },
  { value: 'Equino', label: 'Equino' },
  { value: 'Outro', label: 'Outro' },
];

const DOG_BREEDS = [
  'Beagle',
  'Border Collie',
  'Boxer',
  'Bulldog Francês',
  'Bulldog Inglês',
  'Chihuahua',
  'Chow Chow',
  'Cocker Spaniel',
  'Collie',
  'Dachshund (Salsicha)',
  'Dobermann',
  'Dogue Alemão',
  'Fila Brasileiro',
  'Golden Retriever',
  'Husky Siberiano',
  'Jack Russell Terrier',
  'Labrador Retriever',
  'Lhasa Apso',
  'Maltês',
  'Pastor Alemão',
  'Pastor Belga Malinois',
  'Pinscher',
  'Pitbull',
  'Poodle',
  'Pug',
  'Rodésia Ridgeback',
  'Rottweiler',
  'Samoieda',
  'Schnauzer',
  'Shar Pei',
  'Shih Tzu',
  'Staffordshire Bull Terrier',
  'Weimaraner',
  'West Highland Terrier',
  'Yorkshire Terrier',
  'SRD / Mestiço',
] as const;

const CAT_BREEDS = [
  'Abissínio',
  'Angorá',
  'Azul Russo',
  'Bengal',
  'British Shorthair',
  'Comum (CE)',
  'Cornish Rex',
  'Exótico (Persa de pelo curto)',
  'Himalaio',
  'Maine Coon',
  'Norueguês da Floresta',
  'Oriental',
  'Persa',
  'Ragdoll',
  'Siamês',
  'Sphynx',
  'SRD / Mestiço',
] as const;

const BIRD_BREEDS = [
  'Calopsita',
  'Canário',
  'Periquito Australiano',
  'Periquito-rei',
  'Agapornis',
  'Papagaio (pequeno)',
  'Papagaio (médio/grande)',
  'Outra ave',
] as const;

const RODENT_BREEDS = [
  'Hamster',
  'Porquinho-da-Índia',
  'Chinchila',
  'Gerbil',
  'Camundongo',
  'Rato',
  'Outro roedor',
] as const;

const REPTILE_BREEDS = [
  'Jabuti',
  'Tartaruga',
  'Iguana',
  'Gecko',
  'Cobra (genérico)',
  'Lagarto',
  'Outro réptil',
] as const;

const RABBIT_BREEDS = [
  'Anão',
  'Holland Lop',
  'Angorá',
  'Fuzzy Lop',
  'Nova Zelândia',
  'Outro',
] as const;

const FERRET_BREEDS = ['Padrão', 'Angorá', 'Outro'] as const;

const FISH_BREEDS = [
  'Betta',
  'Neon',
  'Peixe dourado',
  'Ciclídeo',
  'Tetra',
  'Outro',
] as const;

const HORSE_BREEDS = [
  'Quarto de Milha',
  'Mangalarga Marchador',
  'Puro Sangue Inglês',
  'Crioulo',
  'Pônei',
  'Outro',
] as const;

const GENERIC_BREEDS = ['Não aplicável', 'Mestiço', 'Outro / não listado'] as const;

const BREEDS_BY_SPECIES: Record<string, readonly string[]> = {
  Cão: DOG_BREEDS,
  Gato: CAT_BREEDS,
  Ave: BIRD_BREEDS,
  Roedor: RODENT_BREEDS,
  Réptil: REPTILE_BREEDS,
  Coelho: RABBIT_BREEDS,
  Furão: FERRET_BREEDS,
  Peixe: FISH_BREEDS,
  Equino: HORSE_BREEDS,
  Outro: GENERIC_BREEDS,
};

export function wizardBreedOptionsForSpecies(species: string): WizardSelectOption[] {
  const list = BREEDS_BY_SPECIES[species.trim()] ?? GENERIC_BREEDS;
  return [{ value: '', label: 'Selecionar…' }, ...list.map((b) => ({ value: b, label: b }))];
}
