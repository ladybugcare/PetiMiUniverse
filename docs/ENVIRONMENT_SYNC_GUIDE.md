# 🔄 Guia de Sincronização e Proteção de Ambientes

Este guia explica como manter os dados sincronizados e proteger todos os ambientes (local, staging, produção) contra problemas de token inválido no app mobile e web.

---

## 🛡️ Proteção Automática Implementada

### Sistema de Environment Guard

O sistema **`envGuard`** foi implementado para proteger automaticamente contra tokens inválidos:

1. **Detecção de Mudança de Ambiente:**
   - Armazena uma "impressão digital" do ambiente Supabase (URL + prefixo da chave)
   - Compara na inicialização do app
   - Se detectar mudança, limpa automaticamente os dados de autenticação

2. **Limpeza Automática em Erros:**
   - Quando recebe erro 401 com "token inválido" ou "signature invalid"
   - Limpa sessão do Supabase (web e mobile)
   - Força novo login no ambiente correto

3. **Funciona em:**
   - ✅ Web (localStorage)
   - ✅ Mobile (AsyncStorage via Supabase)

---

## 📋 Configuração por Ambiente

### LOCAL (Desenvolvimento)

**Frontend (`frontend/.env.local`):**
```env
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_...
REACT_APP_API_URL=http://localhost:3000

# Expo/Mobile também
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
EXPO_PUBLIC_API_URL=http://localhost:3000
```

**Backend (`backend/.env`):**
```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3002
```

**Mobile (EAS Build / app.json):**
- As variáveis `EXPO_PUBLIC_*` são carregadas automaticamente do `.env.local`
- Ou configure no `app.json` se necessário:
```json
{
  "expo": {
    "extra": {
      "supabaseUrl": "http://127.0.0.1:54321",
      "supabaseAnonKey": "sb_publishable_..."
    }
  }
}
```

---

### STAGING

**Frontend (Vercel → Environment Variables):**
```
REACT_APP_SUPABASE_URL=https://[projeto-staging].supabase.co
REACT_APP_SUPABASE_ANON_KEY=[anon-key-staging]
REACT_APP_API_URL=https://petivet-api-staging.onrender.com

# Mobile (para builds EAS staging)
EXPO_PUBLIC_SUPABASE_URL=https://[projeto-staging].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon-key-staging]
EXPO_PUBLIC_API_URL=https://petivet-api-staging.onrender.com
```

**Backend (Render → Environment):**
```
SUPABASE_URL=https://[projeto-staging].supabase.co
SUPABASE_ANON_KEY=[anon-key-staging]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key-staging]
FRONTEND_URL=https://peti-vet-git-staging-petivet.vercel.app
NODE_ENV=staging
PORT=10000
```

**Mobile (EAS Build - Profile: staging):**
- Configure no `eas.json`:
```json
{
  "build": {
    "staging": {
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://[projeto-staging].supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "[anon-key-staging]",
        "EXPO_PUBLIC_API_URL": "https://petivet-api-staging.onrender.com"
      }
    }
  }
}
```

---

### PRODUÇÃO

**Frontend (Vercel → Environment Variables → Production):**
```
REACT_APP_SUPABASE_URL=https://[projeto-prod].supabase.co
REACT_APP_SUPABASE_ANON_KEY=[anon-key-prod]
REACT_APP_API_URL=https://petivet-api.onrender.com

# Mobile (para builds EAS produção)
EXPO_PUBLIC_SUPABASE_URL=https://[projeto-prod].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon-key-prod]
EXPO_PUBLIC_API_URL=https://petivet-api.onrender.com
```

**Backend (Render → Environment → Production):**
```
SUPABASE_URL=https://[projeto-prod].supabase.co
SUPABASE_ANON_KEY=[anon-key-prod]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key-prod]
FRONTEND_URL=https://peti-vet-petivet.vercel.app
NODE_ENV=production
PORT=10000
```

**Mobile (EAS Build - Profile: production):**
```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://[projeto-prod].supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "[anon-key-prod]",
        "EXPO_PUBLIC_API_URL": "https://petivet-api.onrender.com"
      }
    }
  }
}
```

---

## 🔄 Como Manter Dados Sincronizados

### Regra de Ouro:
> **Frontend e Backend DEVEM usar o MESMO projeto Supabase em cada ambiente!**

### Checklist de Verificação:

#### 1. Verificar Variáveis de Ambiente

**Web (Vercel):**
```bash
# No Vercel → Settings → Environment Variables
# Verifique que todas estão configuradas para o ambiente correto (Preview/Production)
```

**Backend (Render):**
```bash
# No Render → Environment
# Confirme que SUPABASE_URL e SUPABASE_ANON_KEY correspondem ao mesmo projeto
```

**Mobile (EAS):**
```bash
# Verificar eas.json ou variáveis do build
eas build:configure
```

#### 2. Verificar Sincronização Manual

Para garantir que web, mobile e backend estão sincronizados:

**Teste rápido (console do navegador web):**
```javascript
// Deve mostrar a mesma URL do Supabase
console.log('Frontend:', process.env.REACT_APP_SUPABASE_URL);
```

**Teste no backend (logs do Render):**
```javascript
// Deve mostrar a mesma URL
console.log('Backend:', process.env.SUPABASE_URL);
```

**Teste no mobile (usar console.log no código):**
```typescript
console.log('Mobile:', process.env.EXPO_PUBLIC_SUPABASE_URL);
```

#### 3. Verificar Projeto Supabase

1. Acesse: https://app.supabase.com
2. Verifique qual projeto cada ambiente está usando:
   - **Local**: Projeto Supabase local (via Docker) ou projeto dev separado
   - **Staging**: Projeto `petivet-staging` ou similar
   - **Produção**: Projeto `petivet-production` ou similar

**IMPORTANTE:** Cada ambiente deve ter seu próprio projeto Supabase!

---

## 🔧 Troubleshooting

### Problema: Token inválido mesmo após configuração correta

**Causa:** App mobile/web ainda tem tokens do ambiente antigo salvos.

**Solução:**
1. Web: Limpar localStorage:
   ```javascript
   localStorage.clear();
   ```
2. Mobile: Reinstalar o app ou limpar dados do app
3. Fazer logout e login novamente no ambiente correto

### Problema: Dados não aparecem no mobile mas aparecem no web

**Causa:** Mobile usando projeto Supabase diferente do web/backend.

**Verificação:**
1. Compare as variáveis `EXPO_PUBLIC_SUPABASE_URL` do mobile com `REACT_APP_SUPABASE_URL` do web
2. Devem ser **idênticas** para o mesmo ambiente

**Solução:**
1. Atualizar `eas.json` com as variáveis corretas
2. Fazer novo build: `eas build --profile staging` ou `--profile production`
3. Ou usar development build com variáveis do `.env.local`

### Problema: Migrations não aplicadas

**Causa:** Migrations aplicadas em um projeto mas não no outro.

**Solução:**
- Use o workflow de GitHub Actions criado (`.github/workflows/supabase-migrations.yml`)
- Ele aplica automaticamente ao fazer push para `staging` ou `main`
- Ou aplique manualmente no Supabase Dashboard → SQL Editor

---

## 📊 Tabela de Mapeamento de Ambientes

| Ambiente | Frontend URL | Backend URL | Supabase Project | Mobile Config |
|----------|-------------|-------------|------------------|---------------|
| **Local** | `localhost:3002` | `localhost:3000` | Supabase Local (Docker) | `.env.local` ou `eas.json` dev |
| **Staging** | `peti-vet-git-staging-petivet.vercel.app` | `petivet-api-staging.onrender.com` | `petivet-staging` | `eas.json` staging |
| **Produção** | `peti-vet-petivet.vercel.app` | `petivet-api.onrender.com` | `petivet-production` | `eas.json` production |

---

## ✅ Checklist de Deploy

Antes de fazer deploy para staging/produção:

- [ ] Variáveis de ambiente configuradas no Vercel (web)
- [ ] Variáveis de ambiente configuradas no Render (backend)
- [ ] Variáveis de ambiente configuradas no EAS (mobile, se aplicável)
- [ ] Frontend e Backend usando o **mesmo projeto Supabase**
- [ ] Migrations aplicadas no banco correspondente
- [ ] Testado login/logout no ambiente de destino
- [ ] Verificado que tokens funcionam corretamente

---

## 🚨 Boas Práticas

1. **Nunca misture projetos Supabase:**
   - ❌ Não use projeto de staging em produção
   - ❌ Não use projeto local em staging
   - ✅ Cada ambiente = seu próprio projeto

2. **Sempre teste após mudanças:**
   - Teste login após mudar variáveis
   - Verifique que tokens funcionam
   - Teste em mobile E web

3. **Mantenha documentação atualizada:**
   - Documente qual projeto Supabase cada ambiente usa
   - Mantenha este guia atualizado

4. **Use migrations versionadas:**
   - Todas as mudanças de schema via migrations
   - Nunca edite schema manualmente em produção
   - Use GitHub Actions para aplicar automaticamente

---

## 📝 Exemplo de Configuração Completa

### Local
- Supabase: Docker local (`http://127.0.0.1:54321`)
- Frontend: `.env.local` → `REACT_APP_SUPABASE_URL=http://127.0.0.1:54321`
- Backend: `.env` → `SUPABASE_URL=http://127.0.0.1:54321`
- Mobile: `.env.local` → `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`

### Staging
- Supabase: Projeto `petivet-staging` na cloud
- Frontend: Vercel → `REACT_APP_SUPABASE_URL=https://[staging-id].supabase.co`
- Backend: Render → `SUPABASE_URL=https://[staging-id].supabase.co`
- Mobile: EAS → `EXPO_PUBLIC_SUPABASE_URL=https://[staging-id].supabase.co`

### Produção
- Supabase: Projeto `petivet-production` na cloud
- Frontend: Vercel → `REACT_APP_SUPABASE_URL=https://[prod-id].supabase.co`
- Backend: Render → `SUPABASE_URL=https://[prod-id].supabase.co`
- Mobile: EAS → `EXPO_PUBLIC_SUPABASE_URL=https://[prod-id].supabase.co`

---

## 🔍 Como Verificar se Está Sincronizado

Execute este script no console do navegador (web) ou adicione logs no mobile:

```javascript
// Web
console.log({
  supabaseUrl: process.env.REACT_APP_SUPABASE_URL,
  apiUrl: process.env.REACT_APP_API_URL
});

// Mobile (adicionar em algum screen)
console.log({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  apiUrl: process.env.EXPO_PUBLIC_API_URL
});
```

Compare com os logs do backend. Todos devem apontar para o mesmo projeto Supabase no mesmo ambiente.

---

**Última atualização:** 2025-10-31



