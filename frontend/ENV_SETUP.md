# Frontend Environment Variables Setup

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env.local` na raiz do diretório `frontend/` com as seguintes variáveis:

```env
# Supabase Configuration
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key

# Backend API URL
REACT_APP_API_URL=http://localhost:3000

# Alternative for Expo (if using Expo build)
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Para Staging

No Vercel, configure estas variáveis de ambiente:

```env
REACT_APP_SUPABASE_URL=[URL do Supabase Staging]
REACT_APP_SUPABASE_ANON_KEY=[Anon Key do Supabase Staging]
REACT_APP_API_URL=https://petivet-api-staging.onrender.com
```

## Para Produção

```env
REACT_APP_SUPABASE_URL=[URL do Supabase Produção]
REACT_APP_SUPABASE_ANON_KEY=[Anon Key do Supabase Produção]
REACT_APP_API_URL=https://petivet-api.onrender.com
```

## Onde Encontrar as Credenciais

1. Acesse https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings → API**
4. Copie:
   - **Project URL** → REACT_APP_SUPABASE_URL
   - **anon/public key** → REACT_APP_SUPABASE_ANON_KEY

⚠️ **IMPORTANTE**: Nunca commite arquivos `.env.local` ou `.env` no Git!

