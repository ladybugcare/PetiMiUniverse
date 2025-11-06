# Backend Environment Variables Setup

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env` na raiz do diretório `backend/` com as seguintes variáveis:

> 💡 **Dica**: Use os exemplos abaixo como template. Copie e cole em um novo arquivo `.env` e preencha com seus valores reais.

## Para Ambiente Local (Supabase via Docker)

Se você está usando Supabase local via Docker (porta padrão 54321):

```env
# Supabase Configuration (Local via Docker)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your_supabase_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_local_service_role_key

# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL for CORS
# Suporta portas 3001 ou 3002 (React dev server)
FRONTEND_URL=http://localhost:3002
```

**Como obter as chaves do Supabase local:**
1. Inicie o Supabase local: `supabase start`
2. Execute: `supabase status`
3. As chaves estarão no output ou você pode encontrá-las em `.supabase/.env`
4. As chaves geralmente começam com `eyJ...` (JWT tokens)

**Alternativa: Se estiver usando Supabase Cloud para desenvolvimento local:**

```env
# Supabase Configuration (Cloud)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3002
```

## Para Staging (Render)

Configure estas variáveis de ambiente no painel do Render:

```env
SUPABASE_URL=[URL do Supabase Staging]
SUPABASE_ANON_KEY=[Anon Key do Supabase Staging]
SUPABASE_SERVICE_ROLE_KEY=[Service Role Key do Supabase Staging]
PORT=10000
NODE_ENV=staging
FRONTEND_URL=https://staging.petivet.vercel.app
```

## Para Produção

```env
SUPABASE_URL=[URL do Supabase Produção]
SUPABASE_ANON_KEY=[Anon Key do Supabase Produção]
SUPABASE_SERVICE_ROLE_KEY=[Service Role Key do Supabase Produção]
PORT=10000
NODE_ENV=production
FRONTEND_URL=https://petivet.vercel.app
```

## Onde Encontrar as Credenciais

### Para Supabase Local (Docker):
1. Execute `supabase start` para iniciar o Supabase local
2. Execute `supabase status` para ver as credenciais
3. Ou verifique o arquivo `.supabase/.env` no diretório raiz do projeto
4. As chaves estarão listadas como:
   - **API URL** → `http://127.0.0.1:54321` (SUPABASE_URL)
   - **anon key** → SUPABASE_ANON_KEY
   - **service_role key** → SUPABASE_SERVICE_ROLE_KEY

### Para Supabase Cloud:
1. Acesse https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings → API**
4. Copie:
   - **Project URL** → SUPABASE_URL
   - **anon/public key** → SUPABASE_ANON_KEY
   - **service_role key** → SUPABASE_SERVICE_ROLE_KEY

⚠️ **IMPORTANTE**: 
- Nunca commite arquivos `.env` no Git!
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend!
- Esta chave tem acesso total ao banco de dados.

