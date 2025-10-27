export interface Pet {
  id: number;
  nome: string;
  especie: string; // cachorro, gato, etc.
  idade?: number;
  tutor?: string;
  vacinas?: string[];
}
