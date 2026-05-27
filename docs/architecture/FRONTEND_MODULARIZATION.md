# Modularização do frontend — plano incremental

Objetivo: separar **produtos** (Hub, Vet/Match, Marketplace) e **plataforma** (layout, auth, menus) sem big-bang nem quebrar rotas existentes.

## Estado atual (resumo)

- Rotas centralizadas em `frontend/src/App.tsx`.
- Menus por role em `frontend/src/services/sidebarMenuService.tsx`.
- Dashboards por persona em `frontend/src/components/dashboard/...`.
- Possível duplicação legada em `frontend/components/` e `frontend/services/` — novos módulos devem usar apenas `frontend/src/`.

---

## Estrutura alvo (dentro de `frontend/src/`)

```text
frontend/src/
  platform/                 # shared cross-product
    layout/
    auth/
    hooks/
    components/
    types/
  products/
    hub/
      pages/
      components/
      routes.tsx            # lazy route config for Hub
      api/
    vetMatch/
      pages/
      components/
      routes.tsx
    marketplace/
      pages/
      components/
      routes.tsx
  app/                      # optional: shell-only (App composition)
    App.tsx                 # thin re-export from legacy path if moved
```

**Regra**: código em `products/hub` **não importa** páginas de `products/vetMatch` diretamente; apenas componentes de `platform/` ou pacotes UI compartilhados.

### Identidade visual PetMi Hub (logo e paleta)

O Hub **não** reutiliza a identidade do PetMi Vet: **outro logo** e **outra paleta**. O design system global em [frontend/src/styles/colors.ts](frontend/src/styles/colors.ts) continua a servir Vet/Match e restantes áreas legadas; o Hub deve consumir tokens dedicados (ver [HUB_BRANDING.md](./HUB_BRANDING.md)).

Implementação sugerida:

- Arquivo de tema só Hub: `frontend/src/products/hub/theme/hubTheme.ts` (export de escalas e, se útil, CSS variables).
- Assets: `frontend/public/hub/` ou `frontend/assets/hub/`.
- Layout raiz das rotas Hub (`HubLayout`) aplica logo + cores Hub; páginas Hub não usam `colors.brand` como cor de marca principal.

---

## Fases de migração

### Fase A — “Strangler” sem mover arquivos

1. Criar pastas `platform/` e `products/` vazias com `README.md` explicando regras.
2. Novas features do Hub **somente** em `products/hub/`.
3. Extrair de `App.tsx` blocos de rota para funções `getHubRoutes()`, `getVetMatchRoutes()`, `getMarketplaceRoutes()` no mesmo arquivo ou em `app/routes/*.tsx` até estabilizar.

### Fase B — Realocar gradualmente

Ordem sugerida (baixo risco → alto):

1. Componentes puramente visuais compartilhados → `platform/components`.
2. Páginas de marketplace → `products/marketplace/pages` + re-export de path antigo se necessário.
3. Páginas de demands/applications → `products/vetMatch/`.
4. Hub MVP → `packages/hub-ui` + `apps/hub-web` (substitui `frontend/src/products/hub/`).

### Fase C — Menu e permissões

1. `sidebarMenuService.tsx` passa a registrar entradas por **produto** (`source: 'hub' | 'vet_match' | 'marketplace'`).
2. Filtrar itens por **entitlement** (futuro) além de role.
3. Alinhar chaves de permissão com [PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md).

### Fase D — Monorepo packages (em curso)

- **`packages/web-core`**: Supabase singleton web, `apiRequest` / `login`, `AuthProvider`, permissões de staff clínica, `usePermissions`.
- **`packages/hub-ui`**: tema Hub, `HubChrome`, páginas e APIs do domínio Hub.
- **`apps/hub-web`**: app Vite dedicada (porta 3002 em dev); comando na raiz: `npm run dev:hub-web`.
- O bundle **PetMi Vet** em `frontend/` mantém Expo/mobile; links do menu para o Hub usam `REACT_APP_HUB_WEB_URL` quando configurado (ver `frontend/.env.example`).

**Contrato de login partilhado**: ambas as apps chamam `POST /auth/login` no mesmo backend e recebem o mesmo payload. A persistência de sessão (`localStorage` + `supabase.auth.setSession`) é feita por `@petimi/web-core` no Hub; o Vet ainda usa uma cópia local em `frontend/src/AuthContext.tsx` e `frontend/src/services/api.ts`. A convergência do Vet para `@petimi/web-core` é o caminho de deduplicação técnica — ver pendência `vet-web-core`.

**Sessão por origem (por design)**: Hub e Vet são origens de browser diferentes; o Supabase armazena a sessão no `localStorage` de cada origem. Usuários autenticam-se independentemente em cada app. Não há handoff de sessão entre origens — este é o comportamento intencional acordado.

Opcional futuro: extrair `@petimi/ui` partilhado quando o custo de duplicação justificar.

---

## Convenções

- **Rotas URL**: prefixos estáveis sugeridos:
  - Hub: `/hub/...` ou `/clinic/operations/...` (decisão de produto; documentar uma vez).
  - Vet-match: manter `/clinic-*`, `/vet-*` existentes durante transição.
- **Lazy loading**: `React.lazy` por produto para reduzir bundle inicial.
- **State**: `UnitContext`, `AuthContext` permanecem em `platform/`; Hub não duplica.

---

## Checklist por PR

- [ ] Arquivos novos do Vet/Match/Marketplace estão sob `products/<name>` ou `platform/` (quando aplicável).
- [ ] Arquivos do Hub estão em `packages/hub-ui` / `apps/hub-web`; não reintroduzir `frontend/src/products/hub/*` sem motivo.
- [ ] Nenhum import de `products/vetMatch` → `products/hub` (ciclo).
- [ ] Rotas antigas continuam funcionando ou há redirect documentado.
- [ ] Permissão de menu documentada se a rota for restrita.

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Paths de import quebrados | Re-exports temporários; CI `npm run build` |
| Bundle grande | lazy + code splitting por produto |
| Menu confuso | agrupar por produto com headings no sidebar |
