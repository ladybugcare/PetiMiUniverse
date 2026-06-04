# ✅ Setup Staging Environment - Resumo Executivo

## 🎯 Status Atual

### ✅ Concluído
- [x] Branch `staging` criada
- [x] Backend preparado com scripts build/start e CORS configurado
- [x] Arquivos `.env.example` criados
- [x] **Supabase Staging criado** ✨
  - URL: `https://gyprceshzmecvldgahbf.supabase.co`
  - Migrations consolidadas prontas
  - Credenciais copiadas
- [x] Documentação completa criada
- [x] `.gitignore` atualizado para proteger credenciais

### 🔄 Próximos Passos

1. **Executar Migrations no Supabase** (5 min)
   - Copiar `backend/database_migrations/petimi_vet/STAGING_CONSOLIDATED_MIGRATIONS.sql`
   - Colar no Supabase SQL Editor
   - Executar

2. **Configurar Vercel** (10 min)
   - Seguir: `docs/VERCEL_SETUP_GUIDE.md`
   - Adicionar 3 variáveis de ambiente
   - Deploy

3. **Configurar Render** (10 min)
   - Seguir: `docs/RENDER_SETUP_GUIDE.md`
   - Adicionar 6 variáveis de ambiente
   - Deploy

4. **Testar Integração** (5 min)
   - Abrir frontend staging
   - Criar conta / fazer login
   - Verificar se salva no Supabase

---

## 📋 Informações Importantes

### 🌐 URLs (após deploy)

| Componente | URL | Status |
|------------|-----|--------|
| Frontend | `https://staging-petivet.vercel.app` | Pendente deploy |
| Backend | `https://petivet-api-staging.onrender.com` | Pendente deploy |
| Database | `https://gyprceshzmecvldgahbf.supabase.co` | ✅ Criado |

### 🔑 Credenciais

**Localização segura**: `docs/STAGING_CREDENTIALS.md` (não commitado no Git)

**Resumo**:
- ✅ Supabase URL: Disponível
- ✅ Anon Key: Disponível (pode expor no frontend)
- ✅ Service Role Key: Disponível (APENAS backend, NUNCA expor!)

---

## 📖 Guias Disponíveis

### Para Executar Migrations
📄 `backend/database_migrations/README_STAGING.md`
- Passo a passo para executar SQL no Supabase
- Lista de tabelas esperadas
- Troubleshooting

### Para Deploy Frontend (Vercel)
📄 `docs/VERCEL_SETUP_GUIDE.md`
- Configuração completa do Vercel
- Variáveis de ambiente
- Testes e troubleshooting

### Para Deploy Backend (Render)
📄 `docs/RENDER_SETUP_GUIDE.md`
- Configuração completa do Render
- Variáveis de ambiente (incluindo SERVICE_ROLE_KEY)
- Avisos sobre Free Tier
- Troubleshooting detalhado

### Para Credenciais
📄 `docs/STAGING_CREDENTIALS.md` ⚠️ **NÃO COMMITAR**
- Todas as credenciais centralizadas
- Copy-paste pronto para Vercel e Render
- Links úteis

---

## ⚡ Quick Start (30 minutos)

### 1. Migrations (5 min)

```bash
# 1. Abrir Supabase
open https://app.supabase.com/project/gyprceshzmecvldgahbf/sql

# 2. Copiar arquivo
cat backend/database_migrations/petimi_vet/STAGING_CONSOLIDATED_MIGRATIONS.sql | pbcopy

# 3. Colar no SQL Editor e executar
```

### 2. Vercel (10 min)

```bash
# 1. Abrir Vercel
open https://vercel.com/new

# 2. Seguir VERCEL_SETUP_GUIDE.md
# 3. Adicionar 3 variáveis de ambiente
# 4. Deploy
```

### 3. Render (10 min)

```bash
# 1. Abrir Render
open https://dashboard.render.com

# 2. Seguir RENDER_SETUP_GUIDE.md
# 3. Adicionar 6 variáveis de ambiente
# 4. Deploy
```

### 4. Atualizar URL no Vercel (2 min)

Depois que o Render der a URL do backend:
1. Copiar URL (ex: `https://petivet-api-staging.onrender.com`)
2. Vercel → Environment Variables → Editar `REACT_APP_API_URL`
3. Redeploy

### 5. Testar (3 min)

1. Abrir frontend staging
2. Criar conta
3. Fazer login
4. Criar uma demanda (se for clínica)
5. Verificar no Supabase se salvou

---

## 🚨 Avisos Importantes

### Render Free Tier
⚠️ **O backend dorme após 15 minutos sem uso**
- Primeira requisição após dormir: 30-60 segundos
- Normal para ambiente de testes
- Se incomodar, upgrade para Starter ($7/mês)

### Credenciais
⚠️ **NUNCA commite credenciais no Git**
- `.gitignore` já está configurado
- `STAGING_CREDENTIALS.md` está protegido
- Sempre use `.env.local` ou `.env.staging` (nunca `.env`)

### CORS
⚠️ **Frontend e Backend precisam estar sincronizados**
- `FRONTEND_URL` no Render deve apontar para URL do Vercel
- Se mudar URL do Vercel, atualizar no Render

---

## 🔧 Troubleshooting Rápido

### Supabase: "relation does not exist"
✅ **Resolvido**: O arquivo consolidado cria todas as tabelas base primeiro

### Vercel: Build failed
➡️ Verificar se `npm run build:web` funciona localmente
➡️ Ver logs no Vercel Dashboard

### Render: Service reiniciando
➡️ Verificar variáveis de ambiente
➡️ Ver logs no Render Dashboard
➡️ Confirmar que Supabase está acessível

### Frontend: CORS Error
➡️ Aguardar backend subir no Render
➡️ Verificar `FRONTEND_URL` no Render
➡️ Redeploy backend se mudou URL

### Login não funciona
➡️ Confirmar que executou as migrations
➡️ Verificar credenciais no Vercel
➡️ Abrir DevTools → Network → Ver erros da API

---

## 📞 Precisa de Ajuda?

### Documentação Oficial
- Supabase: https://supabase.com/docs
- Vercel: https://vercel.com/docs
- Render: https://render.com/docs

### Arquivos de Referência
- Migrations: `backend/database_migrations/README_STAGING.md`
- Vercel: `docs/VERCEL_SETUP_GUIDE.md`
- Render: `docs/RENDER_SETUP_GUIDE.md`
- Credenciais: `docs/STAGING_CREDENTIALS.md`
- Plano original: `docs/STAGING.md`

---

## ✨ Depois de Tudo Funcionando

### Workflow de Desenvolvimento

1. Desenvolver na branch `feature/nova-feature`
2. PR para `staging`
3. Testar no ambiente staging
4. Aprovar e merge
5. Vercel/Render deployam automaticamente
6. Quando estável, PR de `staging` para `main` (produção futura)

### Próximos Passos Opcionais

- [ ] CI/CD com GitHub Actions
- [ ] Sentry para monitoramento de erros
- [ ] Script de seed data para popular banco
- [ ] Upgrade Render para Starter se usar muito
- [ ] Domain custom no Vercel

---

## 🎉 Parabéns!

Quando tudo estiver rodando, você terá:
- ✅ Ambiente de staging completo
- ✅ Separação de ambientes (dev/staging/prod)
- ✅ Deploy automático via Git
- ✅ Infraestrutura 100% free tier

**Bora subir esse staging!** 🚀

