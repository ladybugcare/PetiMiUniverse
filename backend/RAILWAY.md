# Deploy da API na Railway (PetMi)

Este guia alinha-se ao plano de produção: **Vercel** (frontends) + **Railway** (API Express) + **Supabase** (Auth, Postgres, Storage).

## Regra de ouro: Vercel serverless da API

**Não** removas, desactives nem alteres o deploy serverless do backend na Vercel (`backend/vercel.json`, `backend/api/index.js`) até a API na Railway estar **validada** (smoke tests, login, rotas críticas, CORS). Enquanto isso, o serverless serve de rede de segurança e rollback.

## Ordem segura

1. Criar serviço na **Railway** com **Root Directory** = `backend` (repositório monorepo: apontar o serviço para a pasta `backend/`).
2. Definir variáveis de ambiente (ver secção abaixo).
3. **Build**: `npm ci` ou `npm install`; **Build command**: `npm run build`; **Start command**: `npm start` (equivale a `node dist/server.js`).
4. A Railway expõe uma **URL temporária** (ex. `https://<projeto>.up.railway.app`). Testa o Hub/Vet (ou staging) com `VITE_API_URL` / `REACT_APP_API_URL` apontando para essa URL.
5. Quando estável, adiciona domínio personalizado **`api.petmi.app`** na Railway (DNS CNAME conforme instruções da Railway) e TLS.
6. Atualiza os frontends na Vercel para `https://api.petmi.app`.
7. **Só então** desactiva o deploy da API na Vercel, se aplicável.

## Healthcheck na Railway

- **Método**: `GET`
- **Caminho**: `/health/live`
- **Resposta esperada**: `200` e corpo JSON `{"status":"ok","service":"petivet-api"}` (sem dependência do Supabase).

Configura o healthcheck do serviço na UI da Railway para usar este path.

## Variáveis de ambiente (Railway)

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | Sim | URL do projecto Supabase |
| `SUPABASE_ANON_KEY` | Sim | Chave anon (servidor) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Service role — **só no Railway**, nunca no frontend |
| `NODE_ENV` | Sim | `production` |
| `PORT` | Não | A Railway injeta normalmente; o [server.ts](src/server.ts) usa `process.env.PORT` |
| `PRODUCTION_ORIGINS` | Sim (produção) | Origens CORS separadas por vírgula, **sem** barra final: `https://petmi.app,https://hub.petmi.app,https://shift.petmi.app` |
| `FRONTEND_URL` | Opcional | Ex.: `https://petmi.app` — origem extra permitida pelo CORS em [app.ts](src/app.ts) |
| `LOG_LEVEL` | Opcional | Ex.: `info` |

Ver também [`.env.example`](.env.example) e [ENV_SETUP.md](ENV_SETUP.md).

## CORS e domínios confirmados

| URL | Destino |
|-----|---------|
| `https://petmi.app` | Vercel (PetMi Vet / site) |
| `https://hub.petmi.app` | Vercel (Hub) |
| `https://shift.petmi.app` | Futuro Vercel |
| `https://api.petmi.app` | Railway (API) |

Se usares `www`, inclui explicitamente em `PRODUCTION_ORIGINS`.

## Supabase Auth (painel Supabase)

Após os domínios estarem definidos, no dashboard **Authentication → URL configuration**:

- **Site URL**: a URL principal do produto que fizer login (ex. `https://hub.petmi.app` ou `https://petmi.app`, conforme o fluxo).
- **Redirect URLs**: inclui pelo menos:
  - `https://petmi.app/**` (ou paths exactos que o Auth use)
  - `https://hub.petmi.app/**`
  - `https://shift.petmi.app/**` (para quando o app existir)

Confirma os paths reais de callback de cada app (login, recovery, etc.).

## Frontends (Vercel) — apontar para a API

- **Hub** (`apps/hub-web`): `VITE_API_URL` = URL temporária da Railway durante testes; depois `https://api.petmi.app`.
- **Vet** (`frontend/`): `REACT_APP_API_URL` (e `EXPO_PUBLIC_API_URL` se aplicável) com a mesma lógica.
- **Shift** (futuro): mesmo padrão (`VITE_API_URL`).

Exemplos comentados: [apps/hub-web/.env.example](../apps/hub-web/.env.example), [frontend/.env.example](../frontend/.env.example).

## Comportamento técnico já incluído no código

- **`trust proxy`**: Express configurado para o proxy da Railway (IP real para rate limit e logs).
- **`GET /health/live`**: liveness sem Supabase.
- **Logs**: em produção, Winston escreve só para **consola** (stdout), adequado à Railway.

## Depois da validação na Railway

1. Desactivar o projecto ou deploy Vercel que servia **apenas** a API, ou garantir que os projectos de frontend não compilam `backend/`.
2. Opcional: remover `backend/vercel.json` e `backend/api/index.js` do repositório quando não houver dependência operacional.

## Referência de riscos e endurecimento

Ver [docs/PRODUCTION_HARDENING.md](docs/PRODUCTION_HARDENING.md).
