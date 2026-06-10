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

Este diretório inclui [`vercel.json`](vercel.json) com `rewrites` para servir `index.html` em qualquer rota (ficheiros estáticos existentes, por exemplo em `/assets/`, continuam a ter prioridade).

Confirma no painel do projeto Vercel que a **raiz do código** é `apps/hub-web` (ou que o `vercel.json` aplicado ao deploy contém rewrites equivalentes).

## Documentação de produto (Hub)

- Cadastro futuro (pessoa admin → primeira unidade), em backlog: [`docs/architecture/HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md`](../../docs/architecture/HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md).
