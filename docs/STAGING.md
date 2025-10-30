# Ambiente de Staging

## URLs
- **Frontend**: https://staging.petivet.vercel.app
- **Backend**: https://petivet-api-staging.onrender.com
- **Banco**: Supabase (petivet-staging)

## Fluxo de Deploy

1. Fazer PR para branch `staging`
2. Testar no ambiente staging
3. Aprovar e merge para `main` quando estável

## Avisos Importantes

⚠️ **Render Free Tier**:
- Dorme após 15min de inatividade
- Primeira requisição após despertar: ~30-60s de espera
- Para testes contínuos, considerar upgrade para Starter ($7/mês)

⚠️ **Dados de Staging**:
- Podem ser resetados periodicamente para testes
- Não usar dados sensíveis ou reais
- Banco separado do ambiente de produção

## Configuração Inicial

### 1. Supabase Staging

1. Criar novo projeto em https://app.supabase.com
2. Nome: `petivet-staging`
3. Região: South America (mesma do projeto principal)
4. Executar migrations em ordem (ver `/backend/database_migrations/`)

### 2. Vercel (Frontend)

**Variáveis de Ambiente**:
```
REACT_APP_SUPABASE_URL = [URL do Supabase Staging]
REACT_APP_SUPABASE_ANON_KEY = [Anon Key do Supabase Staging]
REACT_APP_API_URL = https://petivet-api-staging.onrender.com
```

**Configurações**:
- Framework: Create React App
- Root Directory: `frontend`
- Build Command: `npm run build:web`
- Output Directory: `build`
- Branch: `staging`

### 3. Render (Backend)

**Variáveis de Ambiente**:
```
SUPABASE_URL = [URL do Supabase Staging]
SUPABASE_ANON_KEY = [Anon Key do Supabase Staging]
SUPABASE_SERVICE_ROLE_KEY = [Service Role Key do Supabase Staging]
PORT = 10000
NODE_ENV = staging
FRONTEND_URL = https://staging.petivet.vercel.app
```

**Configurações**:
- Name: `petivet-api-staging`
- Branch: `staging`
- Root Directory: `backend`
- Runtime: Node
- Build Command: `npm install && npm run build`
- Start Command: `npm run start:staging`
- Instance Type: Free

## Testando a Integração

### Checklist de Testes

- [ ] Backend responde em https://petivet-api-staging.onrender.com
- [ ] Frontend carrega em https://staging.petivet.vercel.app
- [ ] Criar conta funciona
- [ ] Login funciona
- [ ] Dados salvam no Supabase staging
- [ ] Não há erros de CORS no console
- [ ] Upload de imagens funciona
- [ ] Todas as rotas principais carregam

### Debugging Comum

**Erro de CORS**:
- Verificar se `FRONTEND_URL` está configurado no Render
- Verificar se URL do Vercel está correta

**Backend demora muito**:
- Normal no primeiro acesso (Render acordando)
- Considerar fazer ping periódico ou upgrade

**Supabase não conecta**:
- Verificar se as keys estão corretas
- Verificar se as migrations foram executadas
- Checar se RLS (Row Level Security) não está bloqueando

## Credenciais

### Onde Encontrar

- **Vercel**: https://vercel.com/[seu-projeto]/settings/environment-variables
- **Render**: https://dashboard.render.com/web/[seu-service]/env
- **Supabase**: https://app.supabase.com/project/[project-id]/settings/api

⚠️ **NUNCA** commitar arquivos `.env` com credenciais reais!

## Próximos Passos (Opcional)

1. **CI/CD Avançado**: GitHub Actions para testes automatizados
2. **Monitoramento**: Sentry ou LogRocket para tracking de erros
3. **Upgrade Render**: Se equipe usar staging intensivamente
4. **Seed Data**: Script para popular banco com dados fake
5. **E2E Tests**: Playwright ou Cypress para testes end-to-end

## Contato

Se tiver problemas com o ambiente de staging, documentar issue no GitHub ou contatar a equipe.

