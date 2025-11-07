# Validação de Configuração CORS

## ✅ Configuração Atual

A configuração de CORS está centralizada em `backend/src/app.ts` e é usada através de `server.ts`.

## 🔍 Verificação por Ambiente

### Desenvolvimento Local
**Variáveis necessárias:**
```env
NODE_ENV=development
FRONTEND_URL=http://localhost:3002
```

**Origens permitidas:**
- ✅ `http://localhost:3000`
- ✅ `http://localhost:3001`
- ✅ `http://localhost:3002`
- ✅ `http://localhost:3002` (da variável FRONTEND_URL)
- ✅ Requisições sem origem (Postman, mobile apps)

**Status:** ✅ Configurado corretamente

---

### Staging (Render)
**Variáveis necessárias:**
```env
NODE_ENV=staging
FRONTEND_URL=https://peti-vet-git-staging-petivet.vercel.app
```

**Origens permitidas:**
- ✅ `https://peti-vet-git-staging-petivet.vercel.app` (hardcoded)
- ✅ `https://peti-vet-git-staging-petivet.vercel.app` (da variável FRONTEND_URL)
- ✅ Requisições sem origem (permitidas em staging)

**Status:** ✅ Configurado corretamente

**⚠️ IMPORTANTE:** Certifique-se de que `FRONTEND_URL` está configurada no Render com o valor exato:
```
https://peti-vet-git-staging-petivet.vercel.app
```

---

### Produção
**Variáveis necessárias:**
```env
NODE_ENV=production
FRONTEND_URL=https://peti-vet-petivet.vercel.app
```

**Origens permitidas:**
- ✅ `https://peti-vet-petivet.vercel.app` (hardcoded)
- ✅ `https://peti-vet-petivet.vercel.app` (da variável FRONTEND_URL)
- ❌ Requisições sem origem (bloqueadas em produção)

**Status:** ✅ Configurado corretamente

---

## 🔧 Como a Configuração Funciona

1. **Lista de Origens Permitidas:**
   ```typescript
   const allowedOrigins = [
     'http://localhost:3000',
     'http://localhost:3001',
     'http://localhost:3002',
     'https://peti-vet-git-staging-petivet.vercel.app',
     'https://peti-vet-petivet.vercel.app',
     process.env.FRONTEND_URL, // Variável de ambiente
   ].filter(Boolean);
   ```

2. **Normalização:**
   - Remove barras finais (`/`) das URLs
   - Compara origem normalizada com lista permitida

3. **Validação:**
   - Verifica se origem está na lista
   - Retorna origem exata no header `Access-Control-Allow-Origin`
   - Permite requisições sem origem apenas em dev/staging

4. **Headers CORS:**
   - `credentials: true` - Permite cookies/autenticação
   - `methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']`
   - `allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']`
   - `maxAge: 86400` - Cache de 24h

## 🧪 Teste de Validação

### Teste Manual

1. **Desenvolvimento:**
   ```bash
   curl -H "Origin: http://localhost:3002" \
        -H "Access-Control-Request-Method: GET" \
        -X OPTIONS \
        http://localhost:3000/clinics/check-cnpj/12345678000190
   ```
   Deve retornar: `Access-Control-Allow-Origin: http://localhost:3002`

2. **Staging:**
   ```bash
   curl -H "Origin: https://peti-vet-git-staging-petivet.vercel.app" \
        -H "Access-Control-Request-Method: GET" \
        -X OPTIONS \
        https://petivet-api-staging.onrender.com/clinics/check-cnpj/12345678000190
   ```
   Deve retornar: `Access-Control-Allow-Origin: https://peti-vet-git-staging-petivet.vercel.app`

3. **Produção:**
   ```bash
   curl -H "Origin: https://peti-vet-petivet.vercel.app" \
        -H "Access-Control-Request-Method: GET" \
        -X OPTIONS \
        https://[production-url]/clinics/check-cnpj/12345678000190
   ```
   Deve retornar: `Access-Control-Allow-Origin: https://peti-vet-petivet.vercel.app`

## ⚠️ Problemas Comuns

### 1. CORS bloqueando em staging
**Causa:** `FRONTEND_URL` não configurada ou com valor incorreto no Render

**Solução:**
1. Acesse Render Dashboard → Seu serviço → Environment
2. Verifique se `FRONTEND_URL=https://peti-vet-git-staging-petivet.vercel.app`
3. Verifique se `NODE_ENV=staging`
4. Reinicie o serviço

### 2. Header CORS retornando origem errada
**Causa:** Normalização de URL não funcionando corretamente

**Solução:** A configuração atual normaliza URLs removendo barras finais. Se ainda houver problema, verifique logs do servidor.

### 3. Requisições sem origem bloqueadas em dev
**Causa:** `NODE_ENV` não está definido como `development`

**Solução:** Certifique-se de que `.env` tem `NODE_ENV=development`

## 📋 Checklist de Deploy

Antes de fazer deploy, verifique:

- [ ] `FRONTEND_URL` está configurada corretamente no ambiente
- [ ] `NODE_ENV` está definido corretamente (development/staging/production)
- [ ] URL do frontend está na lista de `allowedOrigins` ou em `FRONTEND_URL`
- [ ] Servidor foi reiniciado após mudanças nas variáveis de ambiente
- [ ] Teste manual de CORS passou

## 🔄 Arquivos Relevantes

- `backend/src/app.ts` - Configuração principal de CORS
- `backend/src/server.ts` - Ponto de entrada (usa app.ts)
- `backend/src/index.ts` - Arquivo legado (não usado, mas atualizado para consistência)

## 📝 Notas

- O arquivo `index.ts` ainda existe mas não é usado pelo `package.json`
- A configuração está centralizada em `app.ts` que é importado por `server.ts`
- Logs de CORS aparecem apenas em desenvolvimento/staging para debug

