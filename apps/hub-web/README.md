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

## Testes e2e (Playwright)

A suíte abre o Hub no Chromium contra o stack local (Vite na **3002** + API na **3000** + Supabase). O Playwright sobe o Vite se a porta estiver livre; **não** sobe o backend.

Antes dos casos autenticados, o projeto `setup` cria (ou reutiliza) contas de teste via API e grava e-mail/senha em `e2e/.auth/users.json` (gitignored):

| Papel | E-mail | Senha padrão |
|---|---|---|
| CADMIN | `e2e.cadmin@example.com` | `E2eHubLocal9!` |
| CSTAFF (leva_traz) | `e2e.cstaff.levatraz@example.com` | a mesma |
| CSTAFF (banho_tosa) | `e2e.cstaff.banho@example.com` | a mesma |
| CSTAFF (clinica) | `e2e.cstaff.clinica@example.com` | a mesma |
| CSTAFF (hotel_creche) | `e2e.cstaff.hotel@example.com` | a mesma |
| CSTAFF (caixa) | `e2e.cstaff.caixa@example.com` | a mesma |
| CSTAFF (recepcao) | `e2e.cstaff.recepcao@example.com` | a mesma |

O CADMIN passa pelo onboarding da clínica; em seguida o setup cadastra os CSTAFF por área, envia o convite, cria tutor/pet e um agendamento de hoje com pernas de leva e traz. Reexecuções são idempotentes.

1. Backend rodando (`npm run dev:backend` na raiz). `HUB_WEB_URL=http://localhost:3002` precisa estar no `.env` do backend (o signup local confirma o e-mail sozinho).
2. Recomendado no `backend/.env.local`: `DISABLE_RATE_LIMIT=true` (o limiter de `/auth/login` é 5 req/15 min).
3. Instalar o browser uma vez: `npm run test:e2e:install` neste diretório.

Opcional — sobrescrever a senha provisionada (exportada no shell ou em `.env.e2e.local`):

```
E2E_HUB_PASSWORD=sua_senha
```

Na raiz do monorepo: `npm run test:e2e:hub`  
Neste diretório: `npm run test:e2e` (ou `npm run test:e2e:ui` para o modo interativo)

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
