# Como Executar as Migrations no Supabase Staging

## 📋 Arquivo Consolidado

Use o arquivo: **`petimi_vet/STAGING_CONSOLIDATED_MIGRATIONS.sql`**

Este arquivo contém TODAS as migrations necessárias em ordem de execução.

## 🚀 Passo a Passo

### 1. Criar Projeto Supabase

1. Acesse: https://app.supabase.com
2. Clique em **"New Project"**
3. Configurações:
   - **Name**: `petivet-staging`
   - **Database Password**: Gere uma senha forte e **SALVE** em lugar seguro
   - **Region**: Escolha **South America (São Paulo)** ou mais próxima
   - **Pricing Plan**: Free

4. Aguarde ~2 minutos enquanto o projeto é criado

### 2. Executar o Arquivo Consolidado

1. No projeto criado, vá em **SQL Editor** (ícone de código no menu lateral)
2. Clique em **"New query"**
3. Abra o arquivo `petimi_vet/STAGING_CONSOLIDATED_MIGRATIONS.sql`
4. **Copie TODO o conteúdo** (Ctrl+A, Ctrl+C)
5. **Cole** no SQL Editor do Supabase
6. Clique em **"Run"** (ou pressione Ctrl+Enter)
7. Aguarde a execução (pode demorar 10-20 segundos)

### 3. Verificar Sucesso

Se tudo correu bem, você verá:

```
status: Migrations consolidadas executadas com sucesso!
message: Ambiente staging está pronto para uso!
```

### 4. Copiar Credenciais

1. No Supabase, vá em **Settings → API**
2. Copie e salve:
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon/public key** (chave pública)
   - **service_role key** (chave privada - NUNCA exponha!)

## 🔍 Verificação das Tabelas

Para verificar se todas as tabelas foram criadas, execute no SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Você deve ver estas tabelas:
- applications
- audit_logs
- clinics
- clinic_users
- demands
- demand_positions
- marketplace_items
- marketplace_messages
- pets
- position_applications
- specialties
- support_tickets
- ticket_evaluations
- ticket_messages
- units
- user_invitations
- vets

## 🔧 Próximos Passos

Depois de executar as migrations com sucesso:

1. ✅ Configure as credenciais no **Vercel** (frontend):
   ```
   REACT_APP_SUPABASE_URL = [sua URL]
   REACT_APP_SUPABASE_ANON_KEY = [sua anon key]
   REACT_APP_API_URL = https://petivet-api-staging.onrender.com
   ```

2. ✅ Configure as credenciais no **Render** (backend):
   ```
   SUPABASE_URL = [sua URL]
   SUPABASE_ANON_KEY = [sua anon key]
   SUPABASE_SERVICE_ROLE_KEY = [sua service role key]
   PORT = 10000
   NODE_ENV = staging
   FRONTEND_URL = https://staging.petivet.vercel.app
   ```

## ⚠️ Importante

- **NUNCA** commite as credenciais reais no Git
- O arquivo `.sql` NÃO contém dados sensíveis, apenas estrutura
- Para dados de teste, você pode criar manualmente via Supabase Dashboard
- Se algo der errado, você pode deletar o projeto Supabase e recomeçar

## 🐛 Troubleshooting

### Erro: "relation already exists"
- Você já executou este script antes
- Solução: Crie um novo projeto Supabase ou ignore os erros (usa `IF NOT EXISTS`)

### Erro: "permission denied"
- Você não tem permissão de admin
- Solução: Certifique-se de estar usando o SQL Editor do Supabase (não um client externo)

### Erro: "foreign key violation"
- Ordem de execução incorreta
- Solução: Use o arquivo consolidado que já está na ordem certa

## 📞 Suporte

Se tiver problemas:
1. Verifique os erros no output do SQL Editor
2. Consulte a documentação em `docs/STAGING.md`
3. Abra um issue no GitHub do projeto

