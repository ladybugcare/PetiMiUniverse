# Backend Environment Variables Setup

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env` na raiz do diretório `backend/` com as seguintes variáveis:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000
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

