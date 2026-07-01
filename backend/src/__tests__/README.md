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
- `src/utils/__tests__/permissions.test.ts` — RBAC

## Stack

Jest 29 + ts-jest + Supertest. Integração usa mock do Supabase (sem DB externo).

