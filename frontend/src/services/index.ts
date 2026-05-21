// Exportar todos os services
export * from './api';
export * from './clinicsApi';
export * from './vetsApi';
export * from './demandsApi';
export * from './applicationsApi';
export * from './adminApi';
export * from './specialtiesApi';


// Centraliza e exporta todas as APIs do PetMi Vet
export * from './api';
export * from './clinicsApi';

// Exporta manualmente as APIs que conflitam, para evitar ambiguidade
export { vetsApi } from './vetsApi';
export { adminApi } from './adminApi';
export { specialtiesApi } from './specialtiesApi';
