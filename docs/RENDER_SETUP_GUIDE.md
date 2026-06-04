# ⚙️ Guia de Deploy Render - Backend Staging

## Pré-requisitos

- [ ] Conta no Render (https://render.com)
- [ ] Repositório GitHub do PetMi Vet
- [ ] Branch `staging` criada e com push feito
- [ ] Credenciais do Supabase Staging
- [ ] URL do frontend Vercel (ex: `https://staging-petivet.vercel.app`)

---

## Passo 1: Criar Web Service

1. Acesse: https://dashboard.render.com
2. Clique em **"New +"** → **"Web Service"**
3. Conecte sua conta GitHub se ainda não conectou
4. Procure e selecione o repositório **PetMi Vet**
5. Clique em **"Connect"**

---

## Passo 2: Configurar o Service

### 2.1 Informações Básicas

**Name:**
```
petivet-api-staging
```

**Region:**
```
Oregon (US West) ou São Paulo (South America) se disponível
```
*Escolha mais próximo dos usuários*

**Branch:**
```
staging
```

**Root Directory:**
```
backend
```

**Runtime:**
```
Node
```

---

### 2.2 Build & Deploy

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm run start
```

---

### 2.3 Plano

**Instance Type:**
```
Free
```

⚠️ **ATENÇÃO**: O plano Free dorme após 15 minutos de inatividade.
- Primeira requisição após dormir: 30-60 segundos
- Para uso contínuo, considere upgrade para Starter ($7/mês)

---

## Passo 3: Environment Variables

Clique em **"Advanced"** → **"Add Environment Variable"**

### Adicionar estas 5 variáveis:

**1. SUPABASE_URL**
```
Key: SUPABASE_URL
Value: https://gyprceshzmecvldgahbf.supabase.co
```

**2. SUPABASE_ANON_KEY**
```
Key: SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5cHJjZXNoem1lY3ZsZGdhaGJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3OTIwNDYsImV4cCI6MjA3NzM2ODA0Nn0.xSFo2IbD0tXPYq2SkybDFY14q6c9AfY2wS5sAMVqz2s
```

**3. SUPABASE_SERVICE_ROLE_KEY** ⚠️ SENSÍVEL!
```
Key: SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5cHJjZXNoem1lY3ZsZGdhaGJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc5MjA0NiwiZXhwIjoyMDc3MzY4MDQ2fQ.Uz1mHKurWziNPw2ezcdCYqj_Hvs7cz3SaGddhMYxvGQ
```

**4. PORT**
```
Key: PORT
Value: 10000
```

**5. NODE_ENV**
```
Key: NODE_ENV
Value: staging
```

**6. FRONTEND_URL** (importante para CORS!)
```
Key: FRONTEND_URL
Value: https://staging-petivet.vercel.app
```
*⚠️ Use a URL real do seu Vercel (sem barra no final)*

---

## Passo 4: Criar o Service

Clique em **"Create Web Service"**

Aguarde ~5-10 minutos enquanto o Render:
- Clona o repositório
- Instala dependências
- Executa o build TypeScript
- Inicia o servidor

---

## Passo 5: Verificar o Deploy

### 5.1 Aguardar Build

Na página do service, você verá os logs em tempo real.

Procure por:
```
==> Build successful 🎉
==> Starting service with 'npm run start'
```

### 5.2 Pegar a URL

Quando terminar, você terá uma URL como:
```
https://petivet-api-staging.onrender.com
```

Copie esta URL!

---

## Passo 6: Testar a API

### 6.1 Teste Básico

Abra no navegador:
```
https://petivet-api-staging.onrender.com
```

**Deve retornar algo** (mesmo que seja um erro 404 ou mensagem simples).

### 6.2 Teste de Health Check

Se você tiver uma rota de health check:
```
https://petivet-api-staging.onrender.com/health
```

---

## Passo 7: Atualizar URL no Vercel

**IMPORTANTE**: Agora que você tem a URL do Render, precisa atualizar no Vercel!

1. Vá no Vercel → seu projeto → **Settings** → **Environment Variables**
2. Encontre `REACT_APP_API_URL`
3. Edite o valor para a URL real do Render:
   ```
   https://petivet-api-staging.onrender.com
   ```
4. Salve
5. Vá em **Deployments** → último deploy → **...** → **Redeploy**

---

## 📋 Checklist Final

- [ ] Web Service criado no Render
- [ ] Branch `staging` selecionada
- [ ] Root directory configurado como `backend`
- [ ] 6 variáveis de ambiente adicionadas
- [ ] Build completado com sucesso
- [ ] URL da API funcionando
- [ ] URL atualizada no Vercel
- [ ] Vercel redeployed com nova URL

---

## 🔧 Troubleshooting

### Erro: "Build failed"

**Verifique se:**
- `npm run build` funciona localmente no backend
- `tsconfig.json` existe e está correto
- `backend/package.json` tem o script `"build": "tsc"`

**Nos logs, procure por:**
```
error TS2304: Cannot find name
```
Geralmente é erro de TypeScript.

---

### Erro: "Module not found"

**Causa**: Dependência não instalada ou import errado.

**Solução**:
1. Verifique `backend/package.json`
2. Confirme que a dependência está listada
3. Se adicionou recentemente, faça commit e push
4. Render vai reinstalar na próxima build

---

### Service fica reiniciando

**Causa**: Erro ao iniciar o servidor (geralmente conexão com Supabase).

**Nos logs, procure por:**
```
Error: Invalid Supabase URL
Error: connect ECONNREFUSED
```

**Solução**:
1. Verifique as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY`
2. Confirme que não tem espaços extras
3. Teste as credenciais localmente primeiro

---

### CORS Error no frontend

**Sintoma**: Frontend carrega mas API retorna erro CORS.

**Causa**: `FRONTEND_URL` não está configurada ou está errada.

**Solução**:
1. Render → Environment → Verifique `FRONTEND_URL`
2. Deve ser exatamente a URL do Vercel
3. SEM barra no final
4. Exemplo: `https://staging-petivet.vercel.app`
5. Após mudar, Render reinicia automático

---

### Service "dormiu"

**Sintoma**: Primeira requisição demora 30-60 segundos.

**Causa**: Render Free Tier dorme após 15 min sem uso.

**Soluções**:
1. **Grátis**: Ping automático (ex: cron job que acessa /health a cada 10 min)
2. **Pago**: Upgrade para Starter ($7/mês) - nunca dorme

---

## 🔄 Próximos Deploys

Depois da configuração inicial:

1. Faça commit na branch `staging`
2. Push para GitHub
3. Render detecta e faz deploy automático
4. API atualiza em ~3-5 minutos

Para forçar redeploy manual:
- Dashboard → seu service → **Manual Deploy** → **Deploy latest commit**

---

## 📊 Monitoramento

### Logs

Para ver logs em tempo real:
```
Dashboard → seu service → Logs
```

Útil para debug de erros.

### Métricas

Render Free mostra:
- CPU usage
- Memory usage
- Request count

---

## ⚠️ Limites do Free Tier

- **Dorme após 15 min** de inatividade
- **750 horas/mês** de uptime (suficiente para testes)
- **100 GB/mês** de bandwidth
- **Reinicialização semanal** automática

Se ultrapassar, considere upgrade.

---

## 🚀 Upgrade para Starter (Opcional)

Se a equipe usar staging intensivamente:

**Benefícios do Starter ($7/mês)**:
- Nunca dorme
- 400 horas/mês (uptime garantido)
- Mais CPU/RAM
- Sem reinicializações

**Como fazer**:
1. Dashboard → seu service → Settings
2. Instance Type → Change
3. Selecione **Starter**
4. Confirme pagamento

---

## 📞 Suporte

- Documentação Render: https://render.com/docs
- Status: https://status.render.com
- Suporte: https://render.com/support

