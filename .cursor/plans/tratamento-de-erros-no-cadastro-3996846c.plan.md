<!-- 3996846c-9b47-45c7-bd38-b6ec5ef4b027 5644b643-7225-4199-880f-cef3eb9f5f31 -->
# Plano: Tratamento de Erros no Cadastro

## Objetivo

Substituir os `alert()` genéricos por modais específicos que exibem mensagens adequadas e ações contextuais para cada tipo de erro no cadastro.

## Estrutura de Implementação

### 1. Helper de Classificação de Erros

**Arquivo:** `frontend/src/utils/signUpErrorHandler.ts`

Função `classifySignUpError(error: any): ClassifiedError` que analisa o erro e retorna:

- `type`: 'email_exists' | 'cnpj_exists' | 'cpf_exists' | 'network_error' | 'unexpected_error'
- `message`: string (opcional, mensagem original)
- `originalError`: any (erro original para debug)

**Padrões de detecção:**

- Email: verifica mensagens contendo "email", "já", "already", "exists", "cadastrado", "registered", "duplicate"
- CNPJ: verifica mensagens contendo "cnpj" + ("já", "already", "exists", "duplicate", "unique constraint")
- CPF: verifica mensagens contendo "cpf" + ("já", "already", "exists", "duplicate", "unique constraint")
- Rede: verifica "network", "fetch", "connection", "timeout", "failed to fetch", "ECONNREFUSED"
- Fallback: qualquer outro erro → 'unexpected_error'

**Estratégia:**

- Verificar `error.message` (string)
- Verificar `error.error` (string)
- Verificar `error.response?.data?.error` (string)
- Normalizar para lowercase antes de verificar padrões

### 2. Componente PublicSupportModal

**Arquivo:** `frontend/src/components/PublicSupportModal.tsx`

Modal de suporte para usuários não autenticados (durante cadastro):

- Campos: Nome (obrigatório), Email (obrigatório, validado), Mensagem (obrigatório, mínimo 10 caracteres)
- Validação de email usando `validateEmail` de `utils/validators`
- Envia para endpoint público do backend: `POST /support/tickets/public`
- Feedback de sucesso/erro usando Alert component
- Design similar ao SupportModal existente, mas sem requerer autenticação
- Botão "Enviar" e "Cancelar"

**Estrutura:**

- State: `{ name, email, message, loading, error, success }`
- Função `handleSubmit` que valida e envia
- Integração com `supportTicketsApi.createPublic()` (a ser criado)

### 3. Componente SignUpErrorModal

**Arquivo:** `frontend/src/components/SignUpErrorModal.tsx`

Modal reutilizável que exibe diferentes mensagens e ações baseado no tipo de erro:

**Props:**

- `isOpen: boolean`
- `onClose: () => void`
- `errorType: SignUpErrorType`
- `onRetry?: () => void` (para network_error)
- `onGoToLogin?: () => void` (para email_exists)
- `onOpenSupport?: () => void` (para cnpj_exists/cpf_exists)

**Tipos de erro e mensagens:**

- `email_exists`: "Não foi possível criar a conta com esse e-mail. Se você já usa o PetMi Vet, tente fazer login." + botão "Entrar agora"
- `cnpj_exists` / `cpf_exists`: "Não foi possível criar a conta com esses dados. Entre em contato com o suporte." + botão "Falar com o suporte"
- `network_error`: "Ops! Tivemos um probleminha na conexão. Pode tentar novamente em alguns instantes?" + botão "Tentar novamente"
- `unexpected_error`: "Algo deu errado aqui. Nossa equipe já foi avisada e vai verificar. Tente novamente mais tarde." + botão "Entendi"

**Características:**

- Design consistente com `Alert.tsx` existente (usar mesmo padrão de cores, ícones, layout)
- Sem emojis nas mensagens
- Integração com `PublicSupportModal` para casos de CNPJ/CPF
- Integração com navegação para `/login` para email_exists

### 4. Endpoint Público de Suporte (Backend)

**Arquivo:** `backend/src/controllers/supportTicketsController.ts` (adicionar função)

**Arquivo:** `backend/src/routes/supportTickets.ts` (adicionar rota)

**Nova função:** `createPublicTicket`

- Rota: `POST /support/tickets/public`
- Body: `{ name: string, email: string, message: string }`
- Validações:
  - Nome: obrigatório, mínimo 3 caracteres
  - Email: obrigatório, formato válido
  - Mensagem: obrigatório, mínimo 10 caracteres
- Cria ticket com:
  - `user_id: null`
  - `user_role: 'guest'`
  - `status: 'open'`
  - Campos adicionais: `guest_name`, `guest_email` (se tabela suportar) ou incluir no campo `message`
- Retorna: `{ ticket: SupportTicket }`

**Rota pública:** Adicionar em `supportTickets.ts` sem middleware de autenticação

### 5. API Service (Frontend)

**Arquivo:** `frontend/src/services/supportTicketsApi.ts` (adicionar função)

**Nova função:** `createPublic`

```typescript
createPublic: async (data: { name: string, email: string, message: string }): Promise<{ ticket: SupportTicket }>
```

### 6. Atualização das Páginas de Cadastro

#### ClinicSignUpPage.tsx

- Importar `SignUpErrorModal`, `PublicSupportModal`, `classifySignUpError`
- Adicionar states:
  - `errorModal: { isOpen: boolean, type: SignUpErrorType | null }`
  - `showSupportModal: boolean`
- No `handleSignUp`, substituir `alert()` por:
  ```typescript
  catch (err: any) {
    const classified = classifySignUpError(err);
    setErrorModal({ isOpen: true, type: classified.type });
  }
  ```

- Adicionar handlers:
  - `handleRetry` → chama `handleSignUp` novamente
  - `handleGoToLogin` → `navigate('/login')`
  - `handleOpenSupport` → `setShowSupportModal(true)`
- Adicionar componentes no JSX:
  - `<SignUpErrorModal>` com props apropriadas
  - `<PublicSupportModal>` com `isOpen={showSupportModal}`

#### VetSignUpPage.tsx

- Mesmas alterações de `ClinicSignUpPage.tsx`
- Verificar se há verificação de CPF específica e incluir no tratamento de erros

## Ordem de Implementação

1. Criar `signUpErrorHandler.ts` (helper de classificação)
2. Criar endpoint público no backend (`createPublicTicket` + rota)
3. Adicionar `createPublic` em `supportTicketsApi.ts`
4. Criar `PublicSupportModal.tsx`
5. Criar `SignUpErrorModal.tsx`
6. Atualizar `ClinicSignUpPage.tsx`
7. Atualizar `VetSignUpPage.tsx`

## Decisões Técnicas

- **Suporte público**: Criar endpoint no backend (mais robusto, permite rastreamento)
- **CPF**: Incluir verificação de CPF para veterinários no error handler
- **Design**: Reutilizar padrão visual do `Alert.tsx` para consistência
- **Navegação**: Usar `useNavigate` do react-router-dom para redirecionamento

## Arquivos a Criar/Modificar

**Novos:**

- `frontend/src/utils/signUpErrorHandler.ts`
- `frontend/src/components/SignUpErrorModal.tsx`
- `frontend/src/components/PublicSupportModal.tsx`

**Modificar:**

- `frontend/src/pages/ClinicSignUpPage.tsx`
- `frontend/src/pages/VetSignUpPage.tsx`
- `frontend/src/services/supportTicketsApi.ts`
- `backend/src/controllers/supportTicketsController.ts`
- `backend/src/routes/supportTickets.ts`

## Cenários de Teste

### 1. Testes do Error Handler (signUpErrorHandler.ts)

**Teste 1.1: Detecção de email_exists**

- Erro com mensagem "Email já cadastrado" → deve retornar `type: 'email_exists'`
- Erro com mensagem "User already registered" → deve retornar `type: 'email_exists'`
- Erro com mensagem "email exists" → deve retornar `type: 'email_exists'`
- Erro com mensagem "E-mail já está em uso" → deve retornar `type: 'email_exists'`

**Teste 1.2: Detecção de cnpj_exists**

- Erro com mensagem "CNPJ já cadastrado" → deve retornar `type: 'cnpj_exists'`
- Erro com mensagem "cnpj duplicate" → deve retornar `type: 'cnpj_exists'`
- Erro com mensagem "unique constraint cnpj" → deve retornar `type: 'cnpj_exists'`

**Teste 1.3: Detecção de cpf_exists**

- Erro com mensagem "CPF já cadastrado" → deve retornar `type: 'cpf_exists'`
- Erro com mensagem "cpf duplicate" → deve retornar `type: 'cpf_exists'`
- Erro com mensagem "unique constraint cpf" → deve retornar `type: 'cpf_exists'`

**Teste 1.4: Detecção de network_error**

- Erro com mensagem "Failed to fetch" → deve retornar `type: 'network_error'`
- Erro com mensagem "Network request failed" → deve retornar `type: 'network_error'`
- Erro com mensagem "ECONNREFUSED" → deve retornar `type: 'network_error'`
- Erro com mensagem "timeout" → deve retornar `type: 'network_error'`
- Erro de tipo TypeError com "fetch" → deve retornar `type: 'network_error'`

**Teste 1.5: Fallback para unexpected_error**

- Erro genérico sem padrão conhecido → deve retornar `type: 'unexpected_error'`
- Erro null/undefined → deve retornar `type: 'unexpected_error'`

**Teste 1.6: Verificação de diferentes estruturas de erro**

- Erro com `error.message` → deve detectar corretamente
- Erro com `error.error` → deve detectar corretamente
- Erro com `error.response.data.error` → deve detectar corretamente
- Erro com múltiplas propriedades → deve verificar todas

### 2. Testes do PublicSupportModal

**Teste 2.1: Validação de campos**

- Tentar enviar sem nome → deve mostrar erro "Nome é obrigatório"
- Tentar enviar sem email → deve mostrar erro "Email é obrigatório"
- Tentar enviar com email inválido → deve mostrar erro "Email inválido"
- Tentar enviar com mensagem < 10 caracteres → deve mostrar erro "Mensagem deve ter pelo menos 10 caracteres"
- Enviar com todos os campos válidos → deve enviar com sucesso

**Teste 2.2: Integração com API**

- Enviar ticket válido → deve chamar `supportTicketsApi.createPublic` com dados corretos
- Sucesso na criação → deve mostrar mensagem de sucesso e fechar modal após 2s
- Erro na API → deve mostrar mensagem de erro
- Loading state → deve desabilitar botão durante envio

**Teste 2.3: UX/UI**

- Modal abre corretamente quando `isOpen={true}`
- Modal fecha quando clica em "Cancelar"
- Modal fecha após sucesso (após 2s)
- Campos são limpos ao fechar modal

### 3. Testes do SignUpErrorModal

**Teste 3.1: Exibição por tipo de erro**

- `email_exists` → deve mostrar mensagem correta e botão "Entrar agora"
- `cnpj_exists` → deve mostrar mensagem correta e botão "Falar com o suporte"
- `cpf_exists` → deve mostrar mensagem correta e botão "Falar com o suporte"
- `network_error` → deve mostrar mensagem correta e botão "Tentar novamente"
- `unexpected_error` → deve mostrar mensagem correta e botão "Entendi"

**Teste 3.2: Ações dos botões**

- Clicar em "Entrar agora" (email_exists) → deve chamar `onGoToLogin` e navegar para `/login`
- Clicar em "Falar com o suporte" (cnpj/cpf_exists) → deve chamar `onOpenSupport` e abrir PublicSupportModal
- Clicar em "Tentar novamente" (network_error) → deve chamar `onRetry` e executar função de retry
- Clicar em "Entendi" (unexpected_error) → deve chamar `onClose` e fechar modal

**Teste 3.3: Design e acessibilidade**

- Modal usa design consistente com Alert.tsx
- Ícones corretos para cada tipo de erro
- Cores corretas para cada tipo de erro
- Modal é acessível (fechar com ESC, focus trap)

### 4. Testes de Integração - Endpoint Público

**Teste 4.1: Validação de entrada**

- POST sem `name` → deve retornar 400 "Nome é obrigatório"
- POST sem `email` → deve retornar 400 "Email é obrigatório"
- POST sem `message` → deve retornar 400 "Mensagem é obrigatória"
- POST com email inválido → deve retornar 400 "Email inválido"
- POST com mensagem < 10 caracteres → deve retornar 400 "Mensagem deve ter pelo menos 10 caracteres"

**Teste 4.2: Criação de ticket**

- POST com dados válidos → deve criar ticket com `user_id: null`, `user_role: 'guest'`
- Ticket criado deve ter `status: 'open'`
- Ticket criado deve ter `guest_name` e `guest_email` (se suportado) ou incluído na mensagem
- Deve retornar 201 com ticket criado

**Teste 4.3: Rota pública**

- Rota não deve exigir autenticação (sem middleware de auth)
- Rota deve estar acessível sem token

### 5. Testes de Integração - Páginas de Cadastro

**Teste 5.1: ClinicSignUpPage - Erro de email**

- Tentar cadastrar com email já existente → deve mostrar SignUpErrorModal com tipo `email_exists`
- Clicar em "Entrar agora" → deve navegar para `/login`

**Teste 5.2: ClinicSignUpPage - Erro de CNPJ**

- Tentar cadastrar com CNPJ já existente → deve mostrar SignUpErrorModal com tipo `cnpj_exists`
- Clicar em "Falar com o suporte" → deve abrir PublicSupportModal
- Preencher e enviar suporte → deve criar ticket público

**Teste 5.3: ClinicSignUpPage - Erro de rede**

- Simular erro de rede (desconectar internet) → deve mostrar SignUpErrorModal com tipo `network_error`
- Clicar em "Tentar novamente" → deve executar `handleSignUp` novamente

**Teste 5.4: ClinicSignUpPage - Erro inesperado**

- Simular erro genérico → deve mostrar SignUpErrorModal com tipo `unexpected_error`
- Clicar em "Entendi" → deve fechar modal

**Teste 5.5: VetSignUpPage - Mesmos cenários**

- Repetir testes 5.1 a 5.4 para VetSignUpPage
- Adicionar teste específico para erro de CPF (se aplicável)

### 6. Testes End-to-End (Manuais)

**Cenário 1: Cadastro com email duplicado**

1. Tentar cadastrar clínica com email já cadastrado
2. Verificar que SignUpErrorModal aparece com mensagem de email_exists
3. Clicar em "Entrar agora"
4. Verificar redirecionamento para `/login`

**Cenário 2: Cadastro com CNPJ duplicado**

1. Tentar cadastrar clínica com CNPJ já cadastrado
2. Verificar que SignUpErrorModal aparece com mensagem de cnpj_exists
3. Clicar em "Falar com o suporte"
4. Verificar que PublicSupportModal abre
5. Preencher nome, email e mensagem
6. Enviar ticket
7. Verificar mensagem de sucesso
8. Verificar que ticket foi criado no banco com `user_role: 'guest'`

**Cenário 3: Erro de conexão**

1. Desconectar internet
2. Tentar cadastrar clínica
3. Verificar que SignUpErrorModal aparece com mensagem de network_error
4. Reconectar internet
5. Clicar em "Tentar novamente"
6. Verificar que cadastro é tentado novamente

**Cenário 4: Erro inesperado**

1. Simular erro 500 do backend
2. Verificar que SignUpErrorModal aparece com mensagem de unexpected_error
3. Clicar em "Entendi"
4. Verificar que modal fecha

**Cenário 5: Validação de PublicSupportModal**

1. Abrir PublicSupportModal
2. Tentar enviar sem preencher campos
3. Verificar mensagens de erro
4. Preencher email inválido
5. Verificar mensagem de erro de email
6. Preencher mensagem com menos de 10 caracteres
7. Verificar mensagem de erro
8. Preencher todos os campos corretamente
9. Enviar
10. Verificar sucesso e fechamento automático

### 7. Testes de Regressão

**Teste 7.1: Cadastro bem-sucedido**

- Verificar que cadastro normal (sem erros) ainda funciona
- Verificar que SignUpSuccessModal ainda aparece após cadastro bem-sucedido
- Verificar que não há alert() sendo chamado

**Teste 7.2: Outros erros não relacionados**

- Verificar que erros de validação de formulário (CNPJ inválido, etc.) não acionam SignUpErrorModal
- Verificar que erros de validação continuam mostrando mensagens inline no formulário

### To-dos

- [ ] Criar helper signUpErrorHandler.ts com função classifySignUpError para detectar tipos de erro (email_exists, cnpj_exists, cpf_exists, network_error, unexpected_error)
- [ ] Criar função createPublicTicket no backend (supportTicketsController.ts) para aceitar tickets de usuários não autenticados
- [ ] Adicionar rota pública POST /support/tickets/public em supportTickets.ts (sem middleware de autenticação)
- [ ] Adicionar função createPublic em supportTicketsApi.ts para chamar endpoint público
- [ ] Criar componente PublicSupportModal.tsx com campos nome, email e mensagem para usuários não autenticados
- [ ] Criar componente SignUpErrorModal.tsx com mensagens e ações específicas para cada tipo de erro
- [ ] Atualizar ClinicSignUpPage.tsx: substituir alert() por SignUpErrorModal, adicionar estados e handlers
- [ ] Atualizar VetSignUpPage.tsx: substituir alert() por SignUpErrorModal, adicionar estados e handlers