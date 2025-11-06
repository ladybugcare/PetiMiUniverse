# Frontend Environment Variables Setup

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env.local` na raiz do diretório `frontend/` com as seguintes variáveis:

> 💡 **Dica**: Use os exemplos abaixo como template. Copie e cole em um novo arquivo `.env.local` e preencha com seus valores reais.

## Para Ambiente Local (Supabase via Docker)

Se você está usando Supabase local via Docker (porta padrão 54321):

```env
# Supabase Configuration (Local via Docker)
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=your_supabase_local_anon_key

# Backend API URL (porta 3000)
REACT_APP_API_URL=http://localhost:3000

# Expo/Mobile Configuration (use as mesmas credenciais)
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_local_anon_key
EXPO_PUBLIC_API_URL=http://localhost:3000
```

**Como obter as chaves do Supabase local:**
1. Inicie o Supabase local: `supabase start`
2. Execute: `supabase status`
3. As chaves estarão no output ou você pode encontrá-las em `.supabase/.env`
4. As chaves geralmente começam com `eyJ...` (JWT tokens)

**Alternativa: Se estiver usando Supabase Cloud para desenvolvimento local:**

```env
# Supabase Configuration (Cloud)
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key

# Backend API URL
REACT_APP_API_URL=http://localhost:3000

# Expo/Mobile Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_API_URL=http://localhost:3000
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

### Para Supabase Local (Docker):
1. Execute `supabase start` para iniciar o Supabase local
2. Execute `supabase status` para ver as credenciais
3. Ou verifique o arquivo `.supabase/.env` no diretório raiz do projeto
4. As chaves estarão listadas como:
   - **API URL** → `http://127.0.0.1:54321` (REACT_APP_SUPABASE_URL)
   - **anon key** → REACT_APP_SUPABASE_ANON_KEY (use a mesma para EXPO_PUBLIC_SUPABASE_ANON_KEY)

### Para Supabase Cloud:
1. Acesse https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings → API**
4. Copie:
   - **Project URL** → REACT_APP_SUPABASE_URL
   - **anon/public key** → REACT_APP_SUPABASE_ANON_KEY (use a mesma para EXPO_PUBLIC_SUPABASE_ANON_KEY)

⚠️ **IMPORTANTE**: Nunca commite arquivos `.env.local` ou `.env` no Git!

