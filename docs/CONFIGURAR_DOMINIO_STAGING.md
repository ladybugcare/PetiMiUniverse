# 🌐 Configurar Domínio de Staging: staging.petivet.com.br

## ✅ O que já foi feito

1. ✅ Domínio `staging.petivet.com.br` adicionado ao projeto Vercel
2. ✅ CORS atualizado no backend para aceitar `staging.petivet.com.br`
3. ✅ CORS atualizado no backend para aceitar `petivet.com.br` (produção)

---

## 📋 Passos para Configurar no Dashboard do Vercel

### 1. Acessar Configurações do Domínio

1. Acesse: https://vercel.com/petivet/peti-vet/settings/domains
2. Você verá os domínios:
   - `petivet.com.br` (produção)
   - `staging.petivet.com.br` (recém adicionado)

### 2. Configurar staging.petivet.com.br para Branch Staging

1. Clique no domínio `staging.petivet.com.br`
2. Em **"Assign to Git Branch"**, selecione: **`staging`**
3. Salve as alterações

**Resultado:**
- `staging.petivet.com.br` → aponta para branch `staging`
- `petivet.com.br` → aponta para branch `main` (produção)

---

## 🔧 Configuração de DNS (se necessário)

Se o domínio ainda não estiver configurado no DNS:

### Opção 1: Nameservers do Vercel (Recomendado)

Se você já configurou os nameservers do Vercel para `petivet.com.br`, o subdomínio `staging.petivet.com.br` funcionará automaticamente.

**Verificar:**
- No seu provedor de domínio (Registro.br, GoDaddy, etc.)
- Os nameservers devem estar apontando para o Vercel

### Opção 2: Registro CNAME (se não usar nameservers)

Se não estiver usando nameservers do Vercel, adicione um registro CNAME:

```
Tipo: CNAME
Nome: staging
Valor: cname.vercel-dns.com
TTL: 3600
```

---

## 🔄 Atualizar Variáveis de Ambiente no Render (Backend) ⚠️ IMPORTANTE

**A variável `FRONTEND_URL` no Render é NECESSÁRIA** (não opcional) porque:
- É usada para CORS (permitir requisições do frontend)
- É usada para redirecionamentos de email (links de confirmação)
- O código do backend depende dela para funcionar corretamente

**Render → petivet-api-staging → Environment:**

Atualize a variável `FRONTEND_URL` para o novo domínio:

```
FRONTEND_URL=https://staging.petivet.com.br
```

**Nota:** O backend já está configurado no código para aceitar ambos os domínios no CORS (`staging.petivet.com.br` e `peti-vet-git-staging-petivet.vercel.app`), mas a variável `FRONTEND_URL` é usada para outras funcionalidades (emails, etc).

**Após atualizar:**
1. Salve as alterações no Render
2. O serviço será reiniciado automaticamente
3. Aguarde ~1-2 minutos para o serviço reiniciar

---

## ✅ Checklist Final

- [ ] Domínio `staging.petivet.com.br` adicionado no Vercel
- [ ] Domínio configurado para branch `staging` no Vercel
- [ ] DNS configurado (nameservers ou CNAME)
- [ ] CORS atualizado no backend (já feito no código)
- [ ] **Variável `FRONTEND_URL` atualizada no Render** ⚠️ **NECESSÁRIO**
- [ ] Serviço do Render reiniciado após atualizar `FRONTEND_URL`
- [ ] Testar acesso em `https://staging.petivet.com.br`

---

## 🧪 Testar

Após configurar:

1. Acesse: https://staging.petivet.com.br
2. Verifique se carrega o frontend
3. Abra DevTools → Console → Não deve ter erros de CORS
4. Teste fazer login

---

## 📝 URLs Finais

| Ambiente | Frontend | Backend |
|----------|----------|---------|
| **Staging** | https://staging.petivet.com.br | https://petivet-api-staging.onrender.com |
| **Produção** | https://petivet.com.br | https://petivet-api.onrender.com |

---

## ⚠️ Importante

- O domínio `staging.petivet.com.br` só funcionará após:
  1. Configurar no dashboard do Vercel para apontar para branch `staging`
  2. DNS estar configurado corretamente
  3. Fazer um novo deploy da branch `staging`

- O primeiro deploy pode levar alguns minutos para propagar o DNS.

