# ⚡ Fix Rápido - Erro CORS (5 minutos)

> ⚠️ **AVISO**: Este documento foi consolidado no guia principal de configuração local.
> 
> **Para informações atualizadas sobre CORS e configuração de ambiente local, consulte:**
> - 📘 [`CONFIGURACAO_AMBIENTE_LOCAL.md`](./CONFIGURACAO_AMBIENTE_LOCAL.md) - Guia completo e atualizado
> 
> Este documento é mantido apenas para referência histórica.

---

## 🎯 O que fazer AGORA

### Passo 1: Configure a variável no Vercel (2 minutos)

1. Abra: https://vercel.com/dashboard
2. Clique no projeto **peti-vet**
3. Vá em **Settings** (aba superior)
4. Menu lateral → **Environment Variables**
5. Procure por `REACT_APP_API_URL`:

**Se NÃO EXISTIR:**
- Clique em **"Add New"**
- Name: `REACT_APP_API_URL`
- Value: `https://petivet-api-staging.onrender.com`
- Marque: Production ✅ Preview ✅ Development ✅
- Clique **Save**

**Se JÁ EXISTIR:**
- Clique em **Edit** (ícone lápis)
- Verifique se o valor é: `https://petivet-api-staging.onrender.com`
- Se estiver errado, corrija e clique **Save**

6. Após salvar, vá em **Deployments** (aba superior)
7. Clique nos **"..."** do último deploy
8. Clique em **"Redeploy"**
9. Confirme

---

### Passo 2: Faça o deploy do código (1 minuto)

Abra o terminal e execute:

```bash
cd /Users/beatrizdias/Documents/PetiVet

git add .

git commit -m "fix: CORS error - add Vercel URL to backend and use env variable for API URLs"

git push origin staging
```

---

### Passo 3: Aguarde os deploys (5-8 minutos)

- ⏱️ **Vercel**: 2-3 minutos
- ⏱️ **Render**: 3-5 minutos

Você pode acompanhar:
- Vercel: https://vercel.com/dashboard → Deployments
- Render: https://dashboard.render.com → petivet-api-staging → Events

---

### Passo 4: Teste (1 minuto)

1. Abra: https://peti-vet-petivet.vercel.app
2. Pressione **F12** para abrir DevTools
3. Vá na aba **Network**
4. Tente fazer **signup** ou **login**
5. Verifique:
   - ✅ Requisições devem ir para `petivet-api-staging.onrender.com`
   - ✅ NÃO deve ter erro CORS vermelho no console
   - ✅ Status deve ser 200 ou 201

---

## ✅ O que foi corrigido no código

### Backend
- Adicionada URL do Vercel nas origens CORS permitidas

### Frontend
- 7 arquivos corrigidos para usar variável de ambiente em vez de `localhost`

---

## 🆘 Se não funcionar

### Erro CORS ainda aparece?

1. **Variável no Vercel está correta?**
   - Deve ser: `https://petivet-api-staging.onrender.com`
   - SEM barra `/` no final

2. **Fez redeploy no Vercel?**
   - Variáveis só funcionam após redeploy

3. **Backend no Render está rodando?**
   - Abra: https://petivet-api-staging.onrender.com
   - Pode demorar 30-60s (sleep do free tier)
   - Se responder algo (mesmo erro), está funcionando

4. **Limpe o cache do navegador:**
   - Chrome/Edge: Ctrl+Shift+R (Windows) ou Cmd+Shift+R (Mac)
   - Ou: DevTools → Application → Clear storage

---

## 📞 Precisa de mais detalhes?

Consulte os arquivos criados:
- `CORS_FIX_SUMMARY.md` - Resumo completo
- `CORS_FIX_GUIDE.md` - Guia detalhado passo a passo

---

**Tempo total estimado: 5-10 minutos** ⏱️

*Criado em: 30/10/2025*

