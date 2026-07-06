# PetMi Hub (web)

App Vite separada do front PetMi Vet. Desenvolvimento: porta **3002**.

## Variáveis (`.env` ou `.env.local`)

```
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Opcional: URL do app Vet para links "PetMi Vet" e redirecionamentos quando o papel não é staff Hub
VITE_VET_WEB_URL=http://localhost:3001
```

## Comandos

Na raiz do monorepo: `npm run dev:hub-web`  
Neste diretório: `npm run dev`

**Nota:** sessão e `localStorage` são por origem; ao usar outra porta que o Vet, é necessário fazer login nesta app (comportamento esperado).

## Deploy (Vercel)

O Hub é uma SPA (React Router). Em produção, um **reload** em rotas como `/hub/orcamentos` ou `/hub/perfil-clinica` pede esse caminho ao servidor; sem reescrita, o Vercel devolve **404**.

Este diretório inclui [`vercel.json`](vercel.json) com `rewrites` para servir `index.html` em qualquer rota (arquivos estáticos existentes, por exemplo em `/assets/`, continuam com prioridade).

### Configuração obrigatória no painel Vercel (projeto `petmi-hub`)

1. **Settings → General → Root Directory:** `apps/hub-web` (sem isso o Vercel instala na raiz do monorepo e não encontra a pasta `dist`).
2. **Build & Development Settings:** deixe em branco ou use *Override* desligado — o `vercel.json` define `installCommand`, `buildCommand` e `outputDirectory`.
3. **Environment Variables:** `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e, se necessário, `VITE_VET_WEB_URL`.

O `installCommand` sobe dois níveis e roda `npm ci` na raiz do monorepo (workspaces `@petimi/hub-ui` e `@petimi/web-core`); o build roda `vite build` e publica `dist/`.

## Documentação de produto (Hub)

- Cadastro futuro (pessoa admin → primeira unidade), em backlog: [`docs/architecture/HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md`](../../docs/architecture/HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md).
