# 📧 Guia do Inbucket - Visualização de Emails no Ambiente Local

O Inbucket é um servidor de email de teste integrado ao Supabase local. Ele captura todos os emails enviados pelo Supabase durante o desenvolvimento local, permitindo que você visualize e teste emails sem precisar de uma conta de email real.

## 🎯 O que é o Inbucket?

O Inbucket é um servidor SMTP de teste que:
- Captura todos os emails enviados pelo Supabase local
- Fornece uma interface web para visualizar os emails
- Permite testar fluxos de confirmação de email sem enviar emails reais
- É totalmente local e não envia emails para a internet

## 🚀 Como Acessar o Inbucket

### 1. Verificar se o Supabase está rodando

```bash
supabase status
```

Você deve ver algo como:

```
API URL: http://127.0.0.1:54321
Inbucket URL: http://127.0.0.1:54324
```

### 2. Acessar a Interface Web

Abra seu navegador e acesse:

```
http://localhost:54324
```

ou

```
http://127.0.0.1:54324
```

## 📬 Como Visualizar Emails

### Interface do Inbucket

1. **Lista de Emails**: A página inicial mostra todos os emails recebidos
2. **Visualizar Email**: Clique em qualquer email para ver o conteúdo completo
3. **Link de Confirmação**: Os emails de confirmação do Supabase contêm links clicáveis
4. **Buscar**: Use a barra de busca para encontrar emails por destinatário

### Estrutura de um Email no Inbucket

- **De (From)**: `no-reply@petivet.local` (configurado no `config.toml`)
- **Para (To)**: O email do usuário que fez signup
- **Assunto (Subject)**: "Confirm your signup" ou similar
- **Corpo**: Contém o link de confirmação com token

## 🔄 Fluxo de Teste Completo

### 1. Fazer Signup

1. Acesse `http://localhost:3002/clinic-signup`
2. Preencha o formulário de cadastro
3. Submeta o formulário

### 2. Verificar Email no Inbucket

1. Abra `http://localhost:54324` em uma nova aba
2. Você verá um novo email na lista
3. Clique no email para abrir

### 3. Confirmar Email

1. No email aberto, encontre o link de confirmação
2. Clique no link (ou copie e cole no navegador)
3. Você será redirecionado para `/email-confirmed`
4. Após 2 segundos, será redirecionado para `/units/create-first`

## ⚙️ Configuração

### Arquivo: `supabase/config.toml`

A configuração do Inbucket está em:

```toml
[inbucket]
enabled = true
port = 54324

[auth.email.smtp]
enabled = true
host = "inbucket"
port = 1025
admin_email = "no-reply@petivet.local"
sender_name = "PetMi Vet"
```

### Variáveis de Ambiente

As variáveis `MAILPIT_SMTP_USER` e `MAILPIT_SMTP_PASS` podem estar vazias para Inbucket local. Isso é normal e não afeta o funcionamento.

## 🔍 Troubleshooting

### Problema: Inbucket não está acessível

**Solução**:
1. Verifique se o Supabase está rodando: `supabase status`
2. Se não estiver, inicie: `supabase start`
3. Aguarde alguns segundos para o Inbucket inicializar
4. Tente acessar novamente `http://localhost:54324`

### Problema: Emails não aparecem no Inbucket

**Possíveis causas**:

1. **Email não está sendo enviado**:
   - Verifique se `email_confirm: true` no código de signup
   - Verifique os logs do backend para erros

2. **SMTP não está configurado**:
   - Verifique `supabase/config.toml` linha 192: `enabled = true`
   - Verifique linha 193: `host = "inbucket"`

3. **Supabase não está rodando**:
   - Execute `supabase status` para verificar
   - Reinicie se necessário: `supabase stop && supabase start`

### Problema: Link de confirmação não funciona

**Solução**:
1. Verifique se o link está completo (não cortado)
2. Verifique se o frontend está rodando na porta correta (3002)
3. Verifique se a URL de redirecionamento está configurada no `config.toml`:
   ```toml
   site_url = "http://localhost:3002"
   additional_redirect_urls = [
     "http://localhost:3002/email-confirmed",
     "http://localhost:3002/units/create-first"
   ]
   ```

### Problema: Inbucket mostra erro 404

**Solução**:
1. Pare o Supabase: `supabase stop`
2. Inicie novamente: `supabase start`
3. Aguarde a inicialização completa
4. Tente acessar novamente

## 📝 Diferenças: Local vs Staging/Production

### Ambiente Local (Inbucket)

- ✅ Emails capturados localmente
- ✅ Interface web para visualizar
- ✅ Não envia emails reais
- ✅ Ideal para desenvolvimento e testes
- 🌐 Acesso: `http://localhost:54324`

### Staging/Production (Supabase Cloud)

- ✅ Emails enviados via SMTP configurado no Supabase Dashboard
- ✅ Emails chegam na caixa de entrada real
- ✅ Configuração SMTP no painel do Supabase
- 🌐 Acesso: Supabase Dashboard → Authentication → Email Templates

## 🎓 Dicas Úteis

1. **Mantenha o Inbucket aberto**: Deixe uma aba do navegador aberta com o Inbucket durante o desenvolvimento
2. **Limpe emails antigos**: O Inbucket mantém todos os emails. Limpe periodicamente para facilitar a busca
3. **Teste diferentes emails**: Use emails diferentes para testar múltiplos signups
4. **Verifique logs**: Se emails não aparecem, verifique os logs do backend e do Supabase

## 🔗 Links Úteis

- [Documentação do Inbucket](https://github.com/inbucket/inbucket)
- [Documentação do Supabase Local](https://supabase.com/docs/guides/cli/local-development)
- [Configuração de Email no Supabase](https://supabase.com/docs/guides/auth/auth-smtp)

## 📚 Arquivos Relacionados

- `supabase/config.toml` - Configuração do Inbucket e SMTP
- `backend/src/controllers/clinics/createClinicPublic.ts` - Código de signup que envia emails
- `docs/CONFIGURACAO_AMBIENTE_LOCAL.md` - Guia geral de configuração local

