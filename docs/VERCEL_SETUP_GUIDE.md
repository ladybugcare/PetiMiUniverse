# 🚀 Guia de Deploy Vercel - Staging

## Pré-requisitos

- [ ] Conta no Vercel (https://vercel.com)
- [ ] Repositório GitHub do PetMi Vet
- [ ] Branch `staging` criada e com push feito
- [ ] Credenciais do Supabase Staging em mãos

---

## Passo 1: Criar Projeto no Vercel

1. Acesse: https://vercel.com/new
2. Clique em **"Import Git Repository"**
3. Escolha o repositório **PetMi Vet**
4. Clique em **"Import"**

---

## Passo 2: Configurar o Projeto

### 2.1 Configure o Framework

- **Framework Preset**: Detecta automaticamente `Create React App`
- **Root Directory**: `frontend`
- **Build Command**: `npm run build:web` (ou deixe automático)
- **Output Directory**: `build` (já detectado)
- **Install Command**: `npm install` (já detectado)

### 2.2 Não clique em "Deploy" ainda! Antes adicione as variáveis.

---

## Passo 3: Adicionar Environment Variables

Antes do primeiro deploy, clique em **"Environment Variables"**:

### Adicionar estas 3 variáveis:

**1. REACT_APP_SUPABASE_URL**
```
Value: https://gyprceshzmecvldgahbf.supabase.co
Environment: Production + Preview
```

**2. REACT_APP_SUPABASE_ANON_KEY**
```
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5cHJjZXNoem1lY3ZsZGdhaGJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3OTIwNDYsImV4cCI6MjA3NzM2ODA0Nn0.xSFo2IbD0tXPYq2SkybDFY14q6c9AfY2wS5sAMVqz2s
Environment: Production + Preview
```

**3. REACT_APP_API_URL**
```
Value: https://petivet-api-staging.onrender.com
Environment: Production + Preview
```

---

## Passo 4: Deploy Inicial

Agora sim, clique em **"Deploy"**.

Aguarde ~2-5 minutos enquanto o Vercel:
- Instala dependências
- Executa o build
- Faz deploy

---

## Passo 5: Configurar Branch Staging

Após o primeiro deploy:

1. Vá em **Settings** → **Git**
2. Em **Production Branch**, deixe: `main`
3. Em **Deploy Hooks**, você pode criar um webhook (opcional)

### 5.1 Conectar Branch Staging

1. Vá em **Deployments**
2. Encontre o deploy da branch `staging`
3. Clique nos **3 pontinhos** → **"Promote to Production"**

**OU**

1. Settings → Domains
2. Clique em **"Add"**
3. Digite: `staging` (vai criar `staging-petivet.vercel.app`)
4. Assign to Git Branch: `staging`

---

## Passo 6: Testar o Deploy

### URL do Deploy

Depois que terminar, você terá:
- **URL automática**: `petivet-[hash].vercel.app`
- **URL da branch**: `staging-petivet.vercel.app` (se configurou)

### Teste:

1. Abra a URL no navegador
2. Verifique se carrega sem erros
3. Abra DevTools → Console → Não deve ter erros de CORS ou Supabase
4. Tente fazer login (se já tiver usuário no staging)

---

## Passo 7: Configurar Domain Custom (Opcional)

Se você tiver um domínio:

1. Settings → Domains → Add
2. Digite: `staging.seudominio.com.br`
3. Configure DNS conforme instruções do Vercel
4. Assign to branch: `staging`

---

## 📋 Checklist Final

- [ ] Projeto importado no Vercel
- [ ] Root directory configurado como `frontend`
- [ ] 3 variáveis de ambiente adicionadas
- [ ] Deploy realizado com sucesso
- [ ] URL funciona e carrega o app
- [ ] Sem erros no Console do navegador
- [ ] Branch staging configurada

---

## 🔧 Troubleshooting

### Erro: "Build failed"
- Verifique se `npm run build:web` funciona localmente
- Veja os logs do build no Vercel
- Confirme que a root directory é `frontend`

### Erro: "REACT_APP_SUPABASE_URL is undefined"
- Confirme que adicionou as 3 variáveis de ambiente
- Confirme que marcou "Production" + "Preview"
- Faça um novo deploy (Deployments → Redeploy)

### App carrega mas login não funciona
- Verifique as credenciais do Supabase
- Abra DevTools → Network → veja se as requisições estão indo para o Supabase correto
- Confirme que executou as migrations no Supabase staging

### CORS Error no console
- O CORS é configurado no backend (Render)
- Aguarde o backend estar no ar também
- Verifique se `FRONTEND_URL` no Render aponta para a URL do Vercel

---

## 🔄 Próximos Deploys

Depois da configuração inicial, é automático:

1. Faça commit na branch `staging`
2. Push para GitHub
3. Vercel detecta e faz deploy automático
4. URL atualiza em ~2-3 minutos

---

## 📞 Suporte

- Documentação Vercel: https://vercel.com/docs
- Troubleshooting: https://vercel.com/support
- Logs de build: Vercel Dashboard → Deployments → [seu deploy] → Build Logs

