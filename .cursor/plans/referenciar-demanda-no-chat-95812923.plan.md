<!-- 95812923-e79a-4cda-b004-9b81345cdc3a c5ea7090-b0d4-4c3e-965e-8eab36e4abf9 -->
# Implementar Referência de Demanda no Chat

## Objetivo

Quando um veterinário ou freelancer envia mensagem da página de demanda, mostrar um card/banner acima da primeira mensagem indicando qual demanda iniciou aquela thread de mensagens. Como a conversa é sempre a mesma entre vet e clínica, precisamos rastrear múltiplas demandas que podem iniciar mensagens na mesma conversa.

## Análise

Requisitos:

1. Mostrar card/banner acima da primeira mensagem quando iniciada da página de demanda (1a)
2. Usar link com título da demanda, não apenas ID (2)
3. Mostrar TODAS as demandas relacionadas à conversa (3b)
4. Se conversa foi iniciada do perfil da clínica (sem demanda), não mostrar nada
5. Se múltiplas demandas iniciaram mensagens, mostrar todas

A tabela `messages` não possui campo `demand_id` - precisamos adicionar via migration.

## Implementação

### 1. Migration: Adicionar campo demand_id na tabela messages

**Arquivo:** `backend/database_migrations/add_demand_id_to_messages.sql` (novo)

- Adicionar coluna `demand_id uuid REFERENCES demands(id) ON DELETE SET NULL` na tabela `messages`
- Criar índice para performance: `idx_messages_demand_id`
- Permitir NULL (mensagens podem não ter demanda associada)

### 2. Atualizar backend para aceitar e salvar demand_id nas mensagens

**Arquivo:** `backend/src/controllers/messagesController.ts`

- Modificar `sendMessage` (linha 454) para:
- Aceitar `demand_id` opcional no body da requisição
- Salvar `demand_id` na mensagem quando fornecido
- Atualizar interface `SendMessageBody` para incluir `demand_id?: string`

- Modificar `getConversation` (linha 375) para:
- Buscar `demand_id` de cada mensagem
- Enriquecer mensagens com dados da demanda quando `demand_id` existir
- Retornar `demand: { id, title }` em cada mensagem que tiver demanda

### 3. Atualizar frontend para passar demand_id ao enviar mensagem da página de demanda

**Arquivo:** `frontend/src/pages/DemandDetailPage.tsx`

- Modificar `handleSendMessageToClinic` para:
- Após criar/encontrar conversa, enviar primeira mensagem com `demand_id`
- Ou melhor: passar `demand_id` como contexto e enviar na primeira mensagem
- Na verdade: quando clicar em "Enviar mensagem", criar conversa E enviar primeira mensagem com `demand_id`

**Arquivo:** `frontend/src/services/messagesApi.ts`

- Atualizar interface `SendMessageData` para incluir `demand_id?: string`
- Atualizar interface `Message` para incluir `demand?: { id: string; title: string }`

### 4. Remover referência do header (implementação anterior)

**Arquivo:** `frontend/src/pages/MessagesPage.tsx`

- Remover o link da demanda do header (linhas 229-247)
- Remover import `ClipboardList` se não for mais usado
- Remover estilo `demandLink`

### 5. Exibir card/banner acima da primeira mensagem de cada demanda

**Arquivo:** `frontend/src/components/ConversationThread.tsx`

- Agrupar mensagens por demanda
- Para cada grupo de mensagens de uma demanda diferente, mostrar um card/banner acima da primeira mensagem
- O card deve mostrar: ícone + "Sobre: [Título da Demanda]" como link clicável
- Link deve navegar para `/demands/${demand.id}`
- Se mensagem não tiver `demand_id`, não mostrar card

**Lógica de agrupamento:**

- Iterar mensagens em ordem cronológica
- Quando encontrar uma mensagem com `demand_id` diferente da anterior (ou primeira com demanda), mostrar card
- Manter agrupamento visual das mensagens da mesma demanda

## Arquivos a Modificar

1. `backend/database_migrations/add_demand_id_to_messages.sql` - Nova migration
2. `backend/src/controllers/messagesController.ts` - Aceitar e retornar demand_id nas mensagens
3. `frontend/src/pages/DemandDetailPage.tsx` - Enviar primeira mensagem com demand_id
4. `frontend/src/services/messagesApi.ts` - Atualizar tipos TypeScript
5. `frontend/src/pages/MessagesPage.tsx` - Remover referência do header
6. `frontend/src/components/ConversationThread.tsx` - Exibir cards de demanda acima das mensagens

## Considerações

- Mensagens podem não ter demanda (quando iniciadas do perfil da clínica)
- Múltiplas demandas podem aparecer na mesma conversa
- Cards devem aparecer apenas acima da primeira mensagem de cada demanda diferente
- Se a demanda for deletada, o `demand_id` será `NULL`, então sempre verificar se existe antes de exibir
- O card deve ser visualmente distinto mas não intrusivo