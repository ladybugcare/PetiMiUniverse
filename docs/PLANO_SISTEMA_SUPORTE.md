# Plano de Implementação: Sistema de Suporte

## Visão Geral
Adicionar um botão de suporte no cabeçalho do dashboard que permite a todos os usuários (clínicas, veterinários) enviar mensagens de suporte para o admin. Criar interface de administração para visualizar, responder e gerenciar tickets de suporte.

## Implementação Backend

### 1. Migração de Banco de Dados
Criar `backend/database_migrations/petimi_vet/create_support_tickets_table.sql`:

**Tabela: `support_tickets`**
- `id` (uuid, chave primária)
- `user_id` (uuid, referência para auth.users)
- `user_role` (text: 'clinic' | 'vet')
- `message` (text, obrigatório)
- `status` (text: 'open' | 'in_progress' | 'resolved' | 'closed', padrão 'open')
- `admin_reply` (text, nullable)
- `admin_id` (uuid, referência para auth.users, nullable)
- `created_at`, `updated_at`, `resolved_at` (timestamps)

**Índices em:** user_id, status, created_at

### 2. Controller
Criar `backend/src/controllers/supportTicketsController.ts`:

**Funções:**
- `createTicket(req, res)` - Usuário cria ticket de suporte
- `getUserTickets(req, res)` - Usuário visualiza seus próprios tickets
- `getAllTickets(req, res)` - Admin visualiza todos os tickets (com filtros)
- `replyToTicket(req, res)` - Admin responde ao ticket
- `updateTicketStatus(req, res)` - Admin atualiza status (in_progress/resolved/closed)

### 3. Rotas
Criar `backend/src/routes/supportTickets.ts`:

**Endpoints:**
- `POST /support/tickets` - Criar ticket
- `GET /support/tickets/my` - Obter tickets do usuário
- `GET /support/tickets` - Obter todos os tickets (apenas admin)
- `PATCH /support/tickets/:id/reply` - Admin responde
- `PATCH /support/tickets/:id/status` - Atualizar status

### 4. Registrar Rotas
Atualizar `backend/src/index.ts` para importar e usar as rotas de support tickets

## Implementação Frontend

### 1. Componente Modal de Suporte
Criar `frontend/src/components/SupportModal.tsx`:

**Recursos:**
- Modal com formulário contendo:
  - Textarea para mensagem (obrigatório, mínimo 10 caracteres)
  - Botões de Enviar e Cancelar
- Mostra mensagem de sucesso após envio
- Gerencia chamada à API para criar ticket
- Usa ícones Lucide (MessageCircle, X, Send)

### 2. Atualizar Cabeçalho do Dashboard
Modificar `frontend/src/components/DashboardHeader.tsx`:

**Alterações:**
- Adicionar botão de Suporte ao lado do sino de notificações (apenas para usuários clínica e vet, não para admin)
- Botão abre o SupportModal
- Usar ícone Lucide `HelpCircle` ou `MessageCircle`
- Posicionar em `rightSection` antes do sino de notificações

### 3. Serviço de API
Criar `frontend/src/services/supportTicketsApi.ts`:

**Funções:**
- `createTicket(message: string)` - Requisição POST
- `getUserTickets()` - GET tickets do usuário
- `getAllTickets()` - GET todos os tickets (admin)
- `replyToTicket(ticketId, reply)` - PATCH resposta
- `updateStatus(ticketId, status)` - PATCH status

### 4. Página de Tickets de Suporte do Admin
Criar `frontend/src/pages/AdminSupportTicketsPage.tsx`:

**Recursos:**
- Usa DashboardLayout com sidebar
- Mostra lista de todos os tickets com filtros (status: todos/aberto/em_progresso/resolvido/fechado)
- Cada card de ticket mostra:
  - Informações do usuário (nome, papel)
  - Mensagem
  - Badge de status
  - Data de criação
  - Seção de resposta (se admin respondeu)
  - Botões de ação: Responder, Marcar como Em Progresso, Marcar como Resolvido, Fechar
- Modal para responder aos tickets
- Ícones Lucide: MessageCircle, Clock, CheckCircle, XCircle, User

### 5. Atualizar Menu do Admin
Atualizar páginas de dashboard do admin (`AdminDashboardPage.tsx`, `AdminProfilePage.tsx`, etc.) para incluir "Tickets de Suporte" nos itens do menu com ícone apropriado

### 6. Adicionar Rota
Atualizar `frontend/src/App.tsx` para adicionar rota `/admin/support-tickets`

## Arquivos Principais a Modificar

**Backend:**
- `backend/src/index.ts` - Registrar rotas

**Frontend:**
- `frontend/src/components/DashboardHeader.tsx` - Adicionar botão de suporte
- `frontend/src/App.tsx` - Adicionar rota de admin
- Itens de menu em: 
  - `AdminDashboardPage.tsx`
  - `AdminProfilePage.tsx`
  - `AdminClinicsPage.tsx`
  - `AdminVetsPage.tsx`
  - `AdminUsersPage.tsx`
  - `AdminDemandsPage.tsx`

## Tarefas em Ordem

1. ✅ Criar migração de banco de dados para tabela support_tickets
2. ✅ Criar supportTicketsController com operações CRUD
3. ✅ Criar rotas de support tickets e registrar no index.ts
4. ✅ Criar serviço de API frontend para tickets de suporte
5. ✅ Criar componente SupportModal para usuários enviarem tickets
6. ✅ Adicionar botão de Suporte ao DashboardHeader
7. ✅ Criar AdminSupportTicketsPage para visualizar e gerenciar tickets
8. ✅ Adicionar item de menu "Tickets de Suporte" em todas as páginas de admin
9. ✅ Adicionar rota de tickets de suporte do admin ao App.tsx

