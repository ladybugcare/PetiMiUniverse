import type { PetBodyPorteValue } from '../utils/hubServiceTypesPricingMatrix';

/** Chave «espécie|raça» (labels do wizard). Valores: mini | pequeno | medio | grande | gigante */
const BREED_DEFAULT: Record<string, PetBodyPorteValue> = {
  // Cães — exemplos típicos (clínica pode ajustar no combobox)
  'Cão|Chihuahua': 'mini',
  'Cão|Pinscher': 'mini',
  'Cão|Yorkshire Terrier': 'mini',
  'Cão|Maltês': 'mini',
  'Cão|Pomeranian': 'mini',
  'Cão|Pug': 'pequeno',
  'Cão|Shih Tzu': 'pequeno',
  'Cão|Dachshund (Salsicha)': 'pequeno',
  'Cão|Jack Russell Terrier': 'pequeno',
  'Cão|West Highland Terrier': 'pequeno',
  'Cão|Beagle': 'medio',
  'Cão|Border Collie': 'medio',
  'Cão|Bulldog Francês': 'medio',
  'Cão|Cocker Spaniel': 'medio',
  'Cão|Schnauzer': 'medio',
  'Cão|Staffordshire Bull Terrier': 'medio',
  'Cão|Boxer': 'grande',
  'Cão|Golden Retriever': 'grande',
  'Cão|Husky Siberiano': 'grande',
  'Cão|Labrador Retriever': 'grande',
  'Cão|Pastor Alemão': 'grande',
  'Cão|Pastor Belga Malinois': 'grande',
  'Cão|Rottweiler': 'grande',
  'Cão|Weimaraner': 'grande',
  'Cão|Dobermann': 'grande',
  'Cão|Fila Brasileiro': 'gigante',
  'Cão|Dogue Alemão': 'gigante',
  'Cão|Rodésia Ridgeback': 'gigante',
  'Cão|Samoieda': 'gigante',
  // Gatos
  'Gato|Comum (CE)': 'pequeno',
  'Gato|Siamês': 'pequeno',
  'Gato|Abissínio': 'pequeno',
  'Gato|British Shorthair': 'medio',
  'Gato|Maine Coon': 'grande',
  'Gato|Ragdoll': 'grande',
  'Gato|Norueguês da Floresta': 'grande',
};

export function defaultBodyPorteForBreed(species: string, breed: string): PetBodyPorteValue | '' {
  const sp = species.trim();
  const br = breed.trim();
  if (!sp || !br) return '';
  const key = `${sp}|${br}`;
  return BREED_DEFAULT[key] ?? '';
}

export function resolvePetBodyPorteForApi(
  selectedSize: string,
  species: string,
  breed: string
): PetBodyPorteValue {
  const s = selectedSize.trim();
  if ((['mini', 'pequeno', 'medio', 'grande', 'gigante'] as const).includes(s as PetBodyPorteValue)) {
    return s as PetBodyPorteValue;
  }
  const d = defaultBodyPorteForBreed(species, breed);
  if (d) return d;
  return 'medio';
}
