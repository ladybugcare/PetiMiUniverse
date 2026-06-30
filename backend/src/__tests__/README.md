# Testes - PetMi Vet Backend

## Executar

```bash
cd backend
npm test              # todos os testes (unitários + integração)
npm run test:watch    # modo watch
npm run test:coverage # com cobertura
```

## Estrutura

- `src/__tests__/helpers/` — mocks Supabase, auth e fixtures de boarding
- `src/modules/hub/boardingBilling.ts` — lógica pura de diárias/filtros
- `src/modules/hub/__tests__/` — testes unitários e `*.integration.test.ts`
- `.github/workflows/backend-tests.yml` — CI

## Stack

Jest 29 + ts-jest + Supertest. Integração usa mock do Supabase (sem DB externo).

