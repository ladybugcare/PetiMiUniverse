# Configuração de E-mail no Supabase

Este documento descreve como configurar o Supabase para redirecionar corretamente após a confirmação de e-mail.

## Passos de Configuração

### 1. Acessar o Painel do Supabase

1. Acesse [https://app.supabase.com](https://app.supabase.com)
2. Selecione seu projeto PetMi Vet
3. Vá em **Authentication** → **URL Configuration**

### 2. Configurar URL de Redirecionamento

Na seção **URL Configuration**, configure os seguintes campos:

- **Site URL**: `http://localhost:3002` (para desenvolvimento) ou sua URL de produção
- **Redirect URLs**: Adicione as seguintes URLs:
  - `http://localhost:3002/email-confirmed`
  - `http://localhost:3002/units/create-first`
  - Sua URL de produção + `/email-confirmed` (quando aplicável)

### 3. Configurar Template de E-mail (Opcional)

Para personalizar o e-mail de confirmação:

1. Vá em **Authentication** → **Email Templates**
2. Selecione **Confirm signup**
3. Modifique o template para incluir informações da PetMi Vet
4. O link de confirmação padrão já deve redirecionar para `/email-confirmed`

### 4. Testar o Fluxo

1. Crie uma nova conta de clínica em `http://localhost:3002/clinic-signup`
2. Preencha o formulário de 5 passos
3. Após submeter, você verá a mensagem "Tudo pronto! 🐶✨"
4. Abra seu e-mail e clique no link de confirmação
5. Você será redirecionado para `/email-confirmed`
6. Após 2 segundos, será redirecionado automaticamente para `/units/create-first`

## Fluxo Completo

```
┌─────────────────────┐
│  Signup (5 steps)   │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  Mensagem Sucesso   │
│  "Tudo pronto! 🐶"  │
│  + Reenviar email   │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  E-mail recebido    │
│  Clicar no link     │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  /email-confirmed   │
│  (salva token)      │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ /units/create-first │
│   (WelcomeModal)    │
└─────────────────────┘
```

## Troubleshooting

### E-mail não chega

- Verifique a pasta de spam
- Use o botão "Reenviar e-mail" na mensagem de sucesso
- Verifique se o e-mail está correto no cadastro

### Redirecionamento não funciona

- Confirme que as URLs estão configuradas corretamente no Supabase
- Verifique o console do navegador para erros
- Certifique-se de que o frontend está rodando na porta correta (3002)

### Token inválido após confirmação

- Limpe o localStorage: `localStorage.clear()`
- Tente fazer login novamente
- Verifique se o backend está rodando

## Arquivos Modificados

- `frontend/src/pages/ClinicSignUpPage.tsx` - Mensagem de sucesso e botão de reenvio
- `frontend/src/pages/EmailConfirmedPage.tsx` - Página de confirmação (nova)
- `frontend/src/App.tsx` - Rota `/email-confirmed` adicionada
- `frontend/src/services/supabase.ts` - Cliente Supabase

## Variáveis de Ambiente

Certifique-se de que as seguintes variáveis estão configuradas:

```bash
REACT_APP_SUPABASE_URL=sua-url-supabase
REACT_APP_SUPABASE_ANON_KEY=sua-chave-anonima
```

