# PetMi Match — SQL migrations

Migrations do **PetMi Match** (adoção / app consumidor). Executar no **Supabase SQL Editor** na ordem abaixo.

Domínio `match` = adoção. Não confundir com `vet-match` (staffing / PetMi Shift) nem com `hub`.

**Pré-requisitos:** função `moddatetime` (`petimi_vet/create_moddatetime_function.sql`). Não altera triggers em `auth.users`.

## Ordem

1. `001_create_match_users.sql` — `match_users`
2. `002_create_match_pets.sql` — `match_pets` (`size_tier`, `petmi_pet_id`)
3. `003_create_match_interactions.sql` — `match_interactions` + `match_validate_interaction`
4. `004_create_match_favorites.sql` — `match_favorites`
5. `005_create_match_rls_policies.sql` — RLS nas quatro tabelas
6. `006_create_match_users_with_email.sql` — `match_auth_email` + view `match_users_with_email`
7. `007_create_match_storage_buckets.sql` — buckets `match-photos` / `match-avatars`
8. `008_create_match_storage_policies.sql` — policies de storage (ou Dashboard se o SQL Editor bloquear)

## Conferência pós-execução

```sql
SELECT tgname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'match_%'
ORDER BY table_name;
```

Esperado: só `on_auth_user_created` e `on_auth_user_deleted` em auth; tabelas `match_favorites`, `match_interactions`, `match_pets`, `match_users`.
