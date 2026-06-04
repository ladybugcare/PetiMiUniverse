# QA manual — PetMi Hub Epic 1 (tutores / `hub_guardians`)

Executar após aplicar [`create_hub_guardians.sql`](../../backend/database_migrations/petimi_hub/create_hub_guardians.sql) e deploy do backend/frontend.

## Pré-requisitos

- Usuário staff com `clinic_user` ativo e `clinic_id` no storage (login clínica).
- Função `moddatetime` existente se usares o trigger do arquivo SQL (ver nota no README das migrações).

## Casos

### 1. Isolamento por clínica

1. Login como CADMIN ou CMANAGER na **clínica A**; ir a `/hub/guardians`; criar um tutor.
2. Login na **clínica B**; ir a `/hub/guardians`.
3. **Esperado:** a lista da clínica B **não** mostra o tutor da clínica A.

### 2. Permissões de escrita

1. **CMANAGER** ou **CADMIN:** deve ver formulário "Novo tutor", criar, editar e arquivar.
2. **CASSISTANT:** deve ver lista; **não** deve ver formulário nem botões Editar/Arquivar (sem `hub.guardians.write`). Se tentar `POST /api/hub/guardians` manualmente → **403**.

### 3. CVET_INTERNAL

1. Login como veterinário interno.
2. **Esperado:** ao acessar `/hub/guardians`, redirecionamento para o dashboard adequado (sem permissões Hub). API `GET /api/hub/guardians` → **403**.

### 4. Token

1. Pedido sem `Authorization: Bearer` → **401**.

### 5. Health

1. `GET /api/hub/health` → **200** e JSON `{ ok: true, product: 'hub', ... }`.

## Registo

| Data | Ambiente | Resultado | Notas |
|------|------------|-------------|-------|
|      |            |             |       |
