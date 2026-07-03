# Testes - PetMi Vet Backend

## Executar

```bash
cd backend
npm test              # todos os testes (unitários + integração)
npm run test:watch    # modo watch
npm run test:coverage # com cobertura
```

## Estrutura

- `src/__tests__/helpers/` — mocks Supabase, auth (`authSupabaseDouble`, `authTestDouble`) e fixtures
- `src/__tests__/auth.test.ts` — login, signup, resend-confirmation
- `src/__tests__/authRateLimit.integration.test.ts` — rate limit de auth
- `src/__tests__/adminAuth.integration.test.ts` — guards de rotas `/admin`
- `src/middleware/__tests__/` — authMiddleware, requireActiveClinic, rateLimiter, privacyGuard
- `src/modules/hub/boardingOperational.ts` — helpers puros (transições, noites, day-board)
- `src/modules/hub/hubBoardingSchemas.ts` — schemas Zod de boarding
- `src/modules/hub/__tests__/boardingOperational.test.ts` — unitários operacionais
- `src/modules/hub/__tests__/hubBoardingSchemas.test.ts` — validação Zod
- `src/modules/hub/__tests__/hubBoardingReservations.integration.test.ts` — open/create/patch
- `src/modules/hub/__tests__/hubBoardingDrawer.integration.test.ts` — drawer + daily logs
- `src/modules/hub/__tests__/hubBoardingUnitSettings.integration.test.ts` — capacidade por unidade
- `src/modules/hub/__tests__/hubBoardingViews.integration.test.ts` — day-board, occupancy, calendar

## Stack

Jest 29 + ts-jest + Supertest. Integração usa mock do Supabase (sem DB externo).

