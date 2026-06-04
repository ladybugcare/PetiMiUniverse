# 🔧 Guia para Corrigir Erro CORS

> ⚠️ **AVISO**: Este documento foi consolidado no guia principal de configuração local.
> 
> **Para informações atualizadas sobre CORS e configuração de ambiente local, consulte:**
> - 📘 [`CONFIGURACAO_AMBIENTE_LOCAL.md`](./CONFIGURACAO_AMBIENTE_LOCAL.md) - Guia completo e atualizado
> 
> Este documento é mantido apenas para referência histórica.

**Data**: 30 de Outubro de 2025  
**Status**: ⚠️ Consolidado - Ver `CONFIGURACAO_AMBIENTE_LOCAL.md`

---

## ❌ Problema Identificado

O frontend no Vercel está tentando acessar `localhost:3000` em vez da URL do backend no Render, causando erro CORS.

### Erro no Console:
```
Access to fetch at 'http://localhost:3888/vets/check-email/...' from origin 'https://peti-vet-petivet.vercel.app' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

---

## ✅ Correções Aplicadas

### 1. Backend (`backend/src/index.ts`)
- ✅ Adicionada URL do Vercel `https://peti-vet-petivet.vercel.app` nas origens permitidas

### 2. Frontend (`frontend/src/services/api.ts`)
- ✅ Mudado de URL hardcoded para variável de ambiente:
```typescript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
```

---

## 🚀 Configuração Necessária no Vercel

**IMPORTANTE**: Você precisa adicionar a variável de ambiente no Vercel!

### Passo a Passo:

1. **Acesse o Vercel:**
   - Vá para: https://vercel.com/dashboard
   - Selecione o projeto: `peti-vet`

2. **Entre em Settings:**
   - Clique na aba "Settings"
   - No menu lateral, clique em "Environment Variables"

3. **Verifique se existe `REACT_APP_API_URL`:**
   - Se **JÁ EXISTE**:
     - Verifique se o valor está: `https://petivet-api-staging.onrender.com`
     - Se estiver diferente, clique em "Edit" e corrija
   
   - Se **NÃO EXISTE**:
     - Clique em "Add New"
     - Name: `REACT_APP_API_URL`
     - Value: `https://petivet-api-staging.onrender.com`
     - Environments: Marque "Production", "Preview", e "Development"
     - Clique em "Save"

4. **Faça Redeploy:**
   - Vá para a aba "Deployments"
   - Clique nos "..." do último deploy
   - Clique em "Redeploy"
   - ✅ Confirme o redeploy

---

## 🔄 Deploy das Correções

Após configurar a variável de ambiente no Vercel, faça o deploy das correções de código:

```bash
git add .
git commit -m "fix: CORS error - add Vercel URL and use env variable for API"
git push origin staging
```

Isso vai:
1. ✅ Render detecta push → Deploy backend com nova origem CORS (~3-5 min)
2. ✅ Vercel detecta push → Deploy frontend com variável de ambiente (~2-3 min)

---

## ✅ Como Verificar se Funcionou

1. **Aguarde os deploys terminarem** (5-10 minutos)

2. **Abra o frontend:**
   - URL: https://peti-vet-petivet.vercel.app

3. **Abra o DevTools:**
   - Pressione F12
   - Vá para a aba "Network"

4. **Tente fazer signup/login:**
   - As requisições devem ir para `https://petivet-api-staging.onrender.com`
   - Não deve mais ter erro CORS
   - Deve ver status 200 ou 201

---

## 🐛 Troubleshooting

### Ainda aparece erro CORS?

**Verifique:**

1. **Variável de ambiente no Vercel está correta?**
   - Deve ser: `https://petivet-api-staging.onrender.com`
   - SEM barra no final

2. **Fez redeploy depois de adicionar a variável?**
   - Variáveis só entram em vigor após novo deploy

3. **Backend no Render está rodando?**
   - Acesse: https://petivet-api-staging.onrender.com
   - Deve retornar algo (pode ser erro, mas deve responder)
   - Se demorar 30-60s é normal (sleep do free tier)

4. **Cache do navegador:**
   - Ctrl+Shift+R (hard refresh)
   - Ou limpe o cache do navegador

### Requisições ainda vão para localhost?

**Possíveis causas:**

1. Redeploy do Vercel não terminou
2. Cache do navegador
3. Variável de ambiente não foi salva corretamente

**Solução:**
- Verifique em Vercel → Settings → Environment Variables
- A variável DEVE aparecer lá
- Faça outro redeploy manualmente

---

## 📝 Resumo das URLs

| Ambiente | Componente | URL |
|----------|------------|-----|
| Staging | Frontend | https://peti-vet-petivet.vercel.app |
| Staging | Backend | https://petivet-api-staging.onrender.com |
| Staging | Database | https://gyprceshzmecvldgahbf.supabase.co |

---

## 🎯 Próximos Passos

Após corrigir:

- [ ] Configurar variável `REACT_APP_API_URL` no Vercel
- [ ] Fazer redeploy manual no Vercel
- [ ] Fazer commit e push das correções de código
- [ ] Aguardar deploys terminarem
- [ ] Testar signup/login
- [ ] Verificar que não há mais erro CORS
- [ ] Verificar que requisições vão para URL correta do Render

---

## 💡 Para Evitar no Futuro

**Sempre use variáveis de ambiente para URLs externas:**

✅ **BOM:**
```typescript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
```

❌ **RUIM:**
```typescript
const API_URL = 'http://localhost:3000'; // Hardcoded!
```

**Por quê?**
- Permite diferentes URLs por ambiente
- Não precisa mudar código para deploy
- Mais seguro e flexível

---

*Documento criado em: 30/10/2025*  
*Problema: Erro CORS em staging*  
*Solução: Variável de ambiente + origem CORS correta*

