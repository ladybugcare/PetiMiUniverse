# Plano: Histórico de Conversação e Avaliação

## 🎯 Funcionalidades a Implementar

### 1. Histórico de Conversação (Múltiplas Mensagens por Ticket)
Atualmente: 1 mensagem do usuário + 1 resposta do admin
Novo: Thread de conversação com múltiplas mensagens de ida e volta

### 2. Avaliação da Resposta do Admin
Usuário pode avaliar o atendimento com estrelas (1-5) e comentário opcional

## 📊 Mudanças no Banco de Dados

### Nova Tabela: `support_ticket_messages`
```sql
CREATE TABLE support_ticket_messages (
  id uuid PRIMARY KEY,
  ticket_id uuid REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id),
  sender_role text, -- 'user' ou 'admin'
  message text NOT NULL,
  created_at timestamp,
  read_by_receiver boolean DEFAULT false
);
```

### Atualizar Tabela: `support_tickets`
```sql
ALTER TABLE support_tickets
  DROP COLUMN message,
  DROP COLUMN admin_reply,
  DROP COLUMN admin_id,
  DROP COLUMN user_read,
  ADD COLUMN rating integer CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN rating_comment text,
  ADD COLUMN rated_at timestamp,
  ADD COLUMN last_message_at timestamp,
  ADD COLUMN last_message_by text; -- 'user' ou 'admin'
```

## 🔧 Backend

### Controllers
`supportTicketsController.ts` - Atualizar funções:

1. **createTicket** - Criar ticket + primeira mensagem
2. **addMessage** - Adicionar nova mensagem ao ticket (user ou admin)
3. **getTicketMessages** - Obter todas as mensagens de um ticket
4. **rateTicket** - Avaliar ticket (apenas usuário, apenas quando resolvido)
5. **markMessagesAsRead** - Marcar mensagens como lidas

### Rotas
`supportTickets.ts` - Novos endpoints:

- `POST /support/tickets/:id/messages` - Adicionar mensagem
- `GET /support/tickets/:id/messages` - Obter mensagens
- `POST /support/tickets/:id/rate` - Avaliar ticket
- `PATCH /support/tickets/:id/messages/read` - Marcar como lido

## 🎨 Frontend

### Componentes Novos

1. **`TicketConversation.tsx`**
   - Thread de mensagens estilo chat
   - Mensagens do usuário à direita (roxo)
   - Mensagens do admin à esquerda (cinza)
   - Indicador "não lido" em mensagens novas
   - Campo de input para nova mensagem no rodapé
   - Auto-scroll para última mensagem

2. **`TicketRating.tsx`**
   - Componente de avaliação com 5 estrelas
   - Campo opcional para comentário
   - Apenas visível quando ticket está resolvido
   - Mostra avaliação existente se já avaliado

### Páginas Atualizadas

1. **`MySupportTicketsPage.tsx`**
   - Clicar em ticket abre modal/página com conversação completa
   - Badge "nova mensagem" quando admin responde
   - Mostrar avaliação se já avaliado
   - Botão para avaliar se resolvido e não avaliado

2. **`AdminSupportTicketsPage.tsx`**
   - Clicar em ticket abre conversação completa
   - Ver thread de mensagens
   - Responder inline (não em modal separado)
   - Ver avaliação do usuário (se houver)
   - Estatísticas de avaliação média

### Serviço de API
`supportTicketsApi.ts` - Novas funções:

- `addMessage(ticketId, message)`
- `getTicketMessages(ticketId)`
- `rateTicket(ticketId, rating, comment?)`
- `markMessagesAsRead(ticketId)`

## 🔄 Lógica de Negócio

### Contagem de Não Lidos
- Contar mensagens onde:
  - `sender_role = 'admin'` 
  - `read_by_receiver = false`
  - `ticket pertence ao usuário`

### Avaliação
- Apenas usuário pode avaliar
- Usuário avalia quando considera o problema resolvido
- **Ao avaliar, o ticket é automaticamente marcado como `resolved`**
- **Após avaliação, não é mais possível enviar novas mensagens (conversação fechada)**
- Avaliação é imutável (não pode mudar depois)
- Admin vê todas as avaliações recebidas
- Se usuário precisar reabrir, deve criar novo ticket

### Thread de Conversação
- Última mensagem atualiza `last_message_at` no ticket
- Badge no ticket principal se última mensagem foi do admin e não lida
- Auto-marcar como lido quando usuário abre a conversação

## 📱 UX/UI

### Para Usuário:

**Lista de Tickets:**
- Card de ticket mostra:
  - Título/assunto
  - Preview da última mensagem
  - Data da última mensagem
  - Badge "nova mensagem" se admin respondeu
  - Estrelas de avaliação (se avaliado)

**Conversação:**
- Thread completa estilo chat
- Input no rodapé para enviar mensagens
- Enviar com Enter ou botão
- Botão "Marcar como Resolvido" sempre visível
- Ao clicar, abre modal de avaliação
- Após avaliar:
  - Ticket marcado como `resolved`
  - Input de mensagem desabilitado
  - Mostra avaliação no topo da thread

**Avaliação (Modal):**
- Abre quando usuário clica "Marcar como Resolvido"
- "Seu problema foi resolvido?"
- 5 estrelas obrigatórias
- Campo opcional de comentário
- Aviso: "Após avaliar, não será possível enviar mais mensagens"
- Botões: "Cancelar" | "Avaliar e Fechar"
- Ao confirmar:
  - Salva avaliação
  - Marca ticket como `resolved`
  - Fecha input de mensagens
  - Mostra mensagem de sucesso

### Para Admin:

**Lista de Tickets:**
- Card mostra:
  - Preview da última mensagem
  - Badge "aguardando resposta" se última foi do usuário
  - Avaliação (se houver) com estrelas
  
**Conversação:**
- Thread completa
- Responder inline
- Ver histórico completo
- Avaliação visível no topo (se houver)

**Dashboard Admin:**
- Estatística: Avaliação média
- Lista de melhores/piores avaliações

## 🎯 Migração de Dados Existentes

```sql
-- 1. Criar nova tabela de mensagens
-- 2. Migrar mensagens existentes
INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, message, created_at)
SELECT 
  id as ticket_id,
  user_id as sender_id,
  'user' as sender_role,
  message,
  created_at
FROM support_tickets
WHERE message IS NOT NULL;

INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, message, created_at)
SELECT 
  id as ticket_id,
  admin_id as sender_id,
  'admin' as sender_role,
  admin_reply,
  updated_at
FROM support_tickets
WHERE admin_reply IS NOT NULL;

-- 3. Atualizar tabela support_tickets
-- 4. Remover colunas antigas
```

## 📦 Ordem de Implementação

1. ✅ Criar nova tabela `support_ticket_messages`
2. ✅ Migrar dados existentes para nova tabela
3. ✅ Atualizar tabela `support_tickets` (adicionar campos de rating)
4. ✅ Backend: Atualizar controllers e rotas
5. ✅ Frontend: Criar `supportTicketsApi` com novas funções
6. ✅ Frontend: Criar componente `TicketConversation`
7. ✅ Frontend: Criar componente `TicketRating`
8. ✅ Frontend: Atualizar `MySupportTicketsPage`
9. ✅ Frontend: Atualizar `AdminSupportTicketsPage`
10. ✅ Testar fluxo completo
11. ✅ Adicionar estatísticas de avaliação no dashboard admin

## 🎨 Design de Interface

### Thread de Mensagens (estilo chat):

**Ticket Ativo (não avaliado):**
```
┌─────────────────────────────────────────┐
│ 📋 Ticket #1234 - Status: Em Análise   │
│              [✓ Marcar como Resolvido]  │
├─────────────────────────────────────────┤
│                                         │
│ [User] Olá, preciso de ajuda com...    │
│ 10:30                                   │
│                                         │
│     [Admin] Olá! Claro, vou ajudar.    │
│                                   11:15 │
│                                         │
│ [User] Obrigado, funcionou!             │
│ 11:45                                   │
│                                         │
├─────────────────────────────────────────┤
│ 💬 Digite sua mensagem...        [Enviar]│
└─────────────────────────────────────────┘
```

**Ticket Avaliado (fechado):**
```
┌─────────────────────────────────────────┐
│ 📋 Ticket #1234 - Status: Resolvido    │
│ ⭐⭐⭐⭐⭐ "Ótimo atendimento!"         │
├─────────────────────────────────────────┤
│                                         │
│ [User] Olá, preciso de ajuda com...    │
│ 10:30                                   │
│                                         │
│     [Admin] Olá! Claro, vou ajudar.    │
│                                   11:15 │
│                                         │
│ [User] Obrigado, funcionou!             │
│ 11:45                                   │
│                                         │
├─────────────────────────────────────────┤
│ ✓ Ticket resolvido e avaliado           │
│ Crie um novo ticket se precisar de ajuda│
└─────────────────────────────────────────┘
```

### Card de Avaliação:

```
┌─────────────────────────────────────────┐
│ 🎯 Como foi o atendimento?              │
│                                         │
│     ⭐ ⭐ ⭐ ⭐ ⭐                         │
│                                         │
│ Comentário (opcional):                  │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│              [Enviar Avaliação]         │
└─────────────────────────────────────────┘
```

## ⚙️ Configurações

### Limites:
- Mensagem mínima: 5 caracteres
- Mensagem máxima: 1000 caracteres
- Avaliação: obrigatória estrelas, comentário opcional
- Comentário máximo: 500 caracteres

### Notificações:
- Badge atualiza em tempo real (30s polling)
- Som opcional ao receber nova mensagem (futuro)

---

**Complexidade:** Média-Alta
**Tempo Estimado:** 3-4 horas
**Impacto:** Alto - Melhora significativa na comunicação

