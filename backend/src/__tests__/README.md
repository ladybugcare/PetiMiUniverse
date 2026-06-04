# Testes - PetMi Vet Backend

## Configuração

Para configurar o ambiente de testes, execute:

```bash
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest
```

Crie um arquivo `jest.config.js` na raiz do backend:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
};
```

## Executar Testes

```bash
# Executar todos os testes
npm test

# Executar em modo watch
npm run test:watch

# Executar com cobertura
npm test -- --coverage
```

## Estrutura de Testes

- `auth.test.ts` - Testes de autenticação
- `validation.test.ts` - Testes de validação com Zod

## Próximos Passos

1. Configurar mocks do Supabase
2. Adicionar testes de integração
3. Configurar CI/CD para executar testes automaticamente

