# Reestruturação do Sidebar - PetMi Vet

## Problema Atual

Atualmente, cada página define seus próprios `menuItems` localmente, causando:
- Inconsistência na navegação entre páginas
- Duplicação de código
- Dificuldade de manutenção
- Experiência confusa para o usuário

## Solução Proposta

Criar um sistema centralizado de menus por role com suporte a subitens, badges dinâmicos, controle de acesso e grupos lógicos.

## Estrutura de Implementação

### 1. Criar serviço centralizado de menus

**Arquivo:** `frontend/src/services/sidebarMenuService.ts`

- Função `getMenuItemsForRole(role: Role, currentPath?: string): MenuItem[]`
- Definir menus completos para cada role com todas as propriedades:
  - **ADMIN**: Dashboard, Usuários (subitens: Todos, Freelancers, Veterinários, Clínicas), Demandas, Mensagens, Relatórios, Tickets de Suporte, Configurações
  - **CADMIN**: Dashboard, Unidades (subitens: Listar, Criar), Usuários, Demandas (subitens: Minhas, Todas, Criar), Marketplace, Auditoria, Tickets, Perfil
  - **CMANAGER**: Dashboard, Demandas (subitens: Minhas, Criar), Pessoas (subitens: Candidaturas, Equipe), Mensagens, Marketplace, Tickets, Perfil
  - **VET**: Dashboard, Demandas (subitens: Disponíveis, Minhas Candidaturas), Mensagens, Avaliações, Marketplace, Tickets, Perfil, Configurações
  - **FREELANCER**: Similar ao VET com ajustes específicos

### 2. Estender interface MenuItem para suportar funcionalidades avançadas

**Arquivo:** `frontend/src/components/DashboardSidebar.tsx`

- Estender interface `MenuItem` com:
  - `subItems?: MenuItem[]` - Para subitens expansíveis
  - `badge?: number | (() => Promise<number>)` - Contadores dinâmicos (mensagens, tickets, etc)
  - `permission?: string` - Controle de acesso baseado em permissões
  - `disabled?: boolean` - Estado desabilitado
  - `tooltip?: string` - Explicação para itens desabilitados
  - `group?: string` - Agrupamento visual (Principal, Gerenciamento, Operacional, Suporte, Perfil)
  - `order?: number` - Ordenação customizada dentro do grupo

### 3. Atualizar DashboardSidebar para renderizar funcionalidades avançadas

**Arquivo:** `frontend/src/components/DashboardSidebar.tsx`

**Fase 1 - Funcionalidades Essenciais:**
- Implementar renderização de subitens com animação de expansão/colapso
- Adicionar indicador visual (seta ChevronRight/ChevronDown) para itens com subitens
- Manter estado de expansão por item (usando useState)
- Estilizar subitens com indentação e cores diferenciadas
- Implementar separadores visuais entre grupos lógicos

**Fase 2 - Melhorias Importantes:**
- Renderizar badges dinâmicos usando componente UnreadBadge existente
- Melhorar detecção de item ativo usando useLocation para comparar rotas
- Destacar item pai quando subitem está ativo
- Adicionar tooltips para itens desabilitados usando title attribute ou componente Tooltip

**Fase 3 - Acessibilidade e UX:**
- Adicionar aria-label, aria-expanded para subitens
- Suporte a navegação por teclado (setas, Enter, Escape)
- Indicadores visuais de foco
- Transições suaves para todas as interações

### 4. Criar hook para gerenciar menus

**Arquivo:** `frontend/src/hooks/useSidebarMenu.ts`

- Hook `useSidebarMenu(role: Role, currentPath?: string)`
- Funcionalidades:
  - Retorna `menuItems` filtrados por permissões usando sistema de permissões existente
  - Filtra itens desabilitados baseado em condições (ex: vet não aprovado)
  - Gerencia estado de expansão de subitens com persistência no localStorage
  - Detecta item ativo baseado na rota atual (useLocation)
  - Carrega badges dinamicamente com memoização e debounce
  - Ordena itens por grupo e order
  - Expande automaticamente grupo que contém item ativo

### 5. Atualizar todas as páginas para usar o serviço centralizado

**Páginas a atualizar:**
- `AdminDashboardPage.tsx`
- `ClinicDashboardPage.tsx`
- `VetDashboardPage.tsx`
- `DemandsPage.tsx`
- `MessagesPage.tsx`
- `NotificationsPage.tsx`
- `MySupportTicketsPage.tsx`
- Outras páginas que usam DashboardLayout

**Mudança:** Substituir definições locais de `menuItems` por chamada ao hook `useSidebarMenu`

### 6. Adicionar grupos lógicos no menu

Organizar itens em grupos visuais:
- **Principal**: Dashboard, principais funcionalidades
- **Gerenciamento**: Unidades, Usuários, Profissionais
- **Operacional**: Demandas, Mensagens, Marketplace
- **Suporte**: Tickets, Configurações
- **Perfil**: Perfil, Configurações pessoais

### 7. Melhorias de UX e Performance

**UX:**
- Indicador visual para página ativa (background color + border-left)
- Badges para contadores dinâmicos (mensagens, tickets, notificações)
- Ícones consistentes usando Lucide React (já implementado)
- Animações suaves para expansão/colapso (transition CSS)
- Responsividade mantida (mobile-first)
- Tooltips informativos para itens desabilitados
- Separadores visuais entre grupos lógicos

**Performance:**
- Memoizar cálculo de badges para evitar requisições desnecessárias
- Debounce/throttle para atualizações de contadores (máximo 1x a cada 30s)
- Lazy loading de badges apenas quando item está visível (IntersectionObserver)
- Persistir estado de expansão no localStorage para melhor UX
- Usar React.memo para componentes de menu item quando apropriado

## Estrutura de Menus Proposta

### ADMIN

1. Dashboard (grupo: Principal)
2. Usuários ▼ (grupo: Gerenciamento)
   - Todos
   - Freelancers
   - Veterinários
   - Clínicas
3. Demandas (grupo: Operacional, badge: contador de demandas ativas)
4. Mensagens (grupo: Operacional, badge: mensagens não lidas)
5. Relatórios (grupo: Operacional)
6. Tickets de Suporte (grupo: Suporte, badge: tickets pendentes)
7. Configurações (grupo: Suporte)

### CADMIN

1. Dashboard (grupo: Principal)
2. Unidades ▼ (grupo: Gerenciamento)
   - Listar Unidades
   - Criar Unidade
3. Usuários (grupo: Gerenciamento)
4. Demandas ▼ (grupo: Operacional)
   - Minhas Demandas
   - Todas as Demandas
   - Criar Demanda
5. Marketplace (grupo: Operacional)
6. Auditoria (grupo: Operacional)
7. Tickets (grupo: Suporte, badge: tickets pendentes)
8. Perfil (grupo: Perfil)

### CMANAGER

1. Dashboard (grupo: Principal)
2. Demandas ▼ (grupo: Operacional)
   - Minhas Demandas
   - Criar Demanda
3. Pessoas ▼ (grupo: Gerenciamento)
   - Candidaturas (badge: candidaturas pendentes)
   - Equipe
4. Mensagens (grupo: Operacional, badge: mensagens não lidas)
5. Marketplace (grupo: Operacional)
6. Tickets (grupo: Suporte, badge: tickets pendentes)
7. Perfil (grupo: Perfil)

### VET

1. Dashboard (grupo: Principal)
2. Demandas ▼ (grupo: Operacional)
   - Disponíveis
   - Minhas Candidaturas (badge: candidaturas ativas)
3. Mensagens (grupo: Operacional, badge: mensagens não lidas)
4. Avaliações (grupo: Operacional)
5. Marketplace (grupo: Operacional)
6. Tickets (grupo: Suporte, badge: tickets pendentes)
7. Perfil (grupo: Perfil)
8. Configurações (grupo: Perfil)

## Arquivos a Criar/Modificar

1. **Novos arquivos:**
   - `frontend/src/services/sidebarMenuService.ts` - Serviço centralizado com menus por role
   - `frontend/src/hooks/useSidebarMenu.ts` - Hook para gerenciar menus, badges e estado

2. **Arquivos a modificar:**
   - `frontend/src/components/DashboardSidebar.tsx` - Estender interface e renderização completa
   - `frontend/src/pages/AdminDashboardPage.tsx` - Usar hook centralizado
   - `frontend/src/pages/ClinicDashboardPage.tsx` - Usar hook centralizado
   - `frontend/src/pages/VetDashboardPage.tsx` - Usar hook centralizado
   - `frontend/src/pages/DemandsPage.tsx` - Usar hook centralizado
   - `frontend/src/pages/MessagesPage.tsx` - Usar hook centralizado
   - `frontend/src/pages/NotificationsPage.tsx` - Usar hook centralizado
   - `frontend/src/pages/MySupportTicketsPage.tsx` - Usar hook centralizado
   - Outras páginas que usam DashboardLayout

3. **Arquivos a consultar (não modificar):**
   - `frontend/src/components/UnreadBadge.tsx` - Reutilizar componente existente
   - `frontend/src/utils/permissions.ts` - Usar sistema de permissões existente
   - `frontend/src/services/notificationsApi.ts` - Para badges de notificações
   - `frontend/src/services/supportTicketsApi.ts` - Para badges de tickets

## Ordem de Implementação (Priorizada)

### Fase 1 - Essencial (Implementar primeiro)
1. Estender interface MenuItem com propriedades básicas (subItems, group, order)
2. Criar serviço sidebarMenuService.ts com menus completos por role
3. Atualizar DashboardSidebar para renderizar subitens básicos
4. Criar hook useSidebarMenu básico
5. Atualizar páginas principais para usar serviço centralizado

### Fase 2 - Importante (Segunda prioridade)
6. Implementar badges dinâmicos nos itens do menu
7. Melhorar detecção de item ativo com useLocation
8. Adicionar separadores visuais entre grupos
9. Implementar persistência de estado de expansão

### Fase 3 - Melhorias (Terceira prioridade)
10. Adicionar filtro por permissões no hook
11. Implementar tooltips para itens desabilitados
12. Adicionar acessibilidade (ARIA, navegação por teclado)
13. Otimizar performance (memoização, debounce)

### Fase 4 - Polimento (Última prioridade)
14. Animações refinadas
15. Testes de acessibilidade
16. Documentação de uso

## Benefícios

- ✅ Navegação consistente em todas as páginas
- ✅ Manutenção centralizada
- ✅ Melhor UX com grupos e subitens organizados
- ✅ Badges dinâmicos para feedback visual
- ✅ Controle de acesso baseado em permissões
- ✅ Acessibilidade completa
- ✅ Performance otimizada
- ✅ Fácil adicionar novos itens no futuro
- ✅ Código mais limpo e DRY

