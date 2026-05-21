# Dashboard Structure Guide - PetMi Vet

## 📋 Visão Geral

O sistema PetMi Vet agora possui **dashboards dinâmicos** que se adaptam automaticamente ao tipo e role do usuário, oferecendo uma experiência personalizada para cada perfil.

---

## 🎯 Estrutura de Dashboards

### 1. **AdminDashboardPage** (`/admin-dashboard`)
**Para quem:** Administradores do Sistema PetMi Vet

**Acesso:** Usuários com `user.role = 'admin'`

**Funcionalidades:**
- 📊 Visão geral de todo o sistema
- 🏥 Gerenciar todas as clínicas
- 👨‍⚕️ Gerenciar todos os veterinários
- 📋 Visão geral de todas as demandas
- 📈 Relatórios e analytics do sistema
- ⚙️ Configurações gerais
- 🔍 Monitoramento de saúde do sistema

**Menu Items:**
- Visão Geral
- Clínicas
- Veterinários
- Demandas
- Relatórios
- Configurações
- Sair

---

### 2. **ClinicDashboardPage** (`/clinic-dashboard`)
**Para quem:** Clínicas e seus colaboradores

**Acesso:** Usuários com `user.role = 'clinic'` ou `clinic_user.role`

Este dashboard possui **4 variações dinâmicas** baseado no `clinic_role`:

#### 2.1. **CADMIN** (Administrador da Clínica)
**Acesso Total** - Gerencia toda a clínica

**Menu Items:**
- 📊 Visão Geral (todas as unidades)
- 🏥 Gerenciar Unidades
- 👥 Gerenciar Usuários
- 📋 Todas as Demandas
- 🛒 Marketplace
- 🔍 Logs de Auditoria
- 👤 Perfil
- 🚪 Sair

**FAB Options:**
- 📋 Criar Demanda
- 🏥 Nova Unidade
- 🛒 Criar Anúncio

**Componente:** `AdminDashboard.tsx`

---

#### 2.2. **CMANAGER** (Gestor de Unidade)
**Gerencia uma unidade específica**

**Menu Items:**
- 📊 Resumo da Unidade
- 📋 Demandas
- 👩‍⚕️ Profissionais
- 👥 Equipe da Unidade
- 💬 Mensagens
- 🛒 Marketplace
- 👤 Perfil
- 🚪 Sair

**FAB Options:**
- 📋 Criar Demanda
- 🛒 Criar Anúncio

**Componente:** `ManagerDashboard.tsx`

---

#### 2.3. **CASSISTANT** (Assistente/Secretário)
**Operações básicas**

**Menu Items:**
- 📊 Resumo
- 📋 Demandas
- 💬 Mensagens
- 🛒 Marketplace
- 👤 Perfil
- 🚪 Sair

**FAB Options:**
- 📋 Criar Demanda

**Componente:** `AssistantDashboard.tsx`

---

#### 2.4. **CVET_INTERNAL** (Veterinário Interno)
**Veterinário contratado pela clínica**

**Menu Items:**
- 📊 Meu Resumo
- 📋 Demandas Disponíveis
- 📝 Minhas Candidaturas
- 💬 Mensagens
- ⭐ Minhas Avaliações
- 👤 Meu Perfil
- 🚪 Sair

**FAB Options:**
- 📋 Ver Demandas

**Componente:** `VetInternalDashboard.tsx`

---

### 3. **VetDashboardPage** (`/vet-dashboard`)
**Para quem:** Veterinários autônomos/freelancers

**Acesso:** Usuários com `user.role = 'vet'`

**Funcionalidades:**
- 📊 Meu Resumo
- 📋 Demandas Disponíveis
- 📝 Minhas Candidaturas
- 💬 Mensagens
- ⭐ Minhas Avaliações
- 🛒 Marketplace
- 👤 Meu Perfil
- ⚙️ Configurações
- 🚪 Sair

---

## 🏗️ Arquitetura

### Estrutura de Arquivos

```
frontend/src/
├── pages/
│   ├── AdminDashboardPage.tsx        # Sistema Admin
│   ├── ClinicDashboardPage.tsx       # Clínicas (dinâmico)
│   └── VetDashboardPage.tsx          # Veterinários
│
├── components/
│   └── dashboard/
│       └── clinic/
│           ├── AdminDashboard.tsx       # CADMIN content
│           ├── ManagerDashboard.tsx     # CMANAGER content
│           ├── AssistantDashboard.tsx   # CASSISTANT content
│           └── VetInternalDashboard.tsx # CVET_INTERNAL content
│
├── hooks/
│   └── usePermissions.tsx            # Detecção de role
│
└── contexts/
    └── UnitContext.tsx               # Gerenciamento de unidade selecionada
```

---

## 🔄 Fluxo de Autenticação e Redirecionamento

### LoginPage.tsx

```typescript
const userRole = result.user?.user_metadata?.role || result.user?.role;

if (userRole === 'admin') {
  navigate('/admin-dashboard');      // Sistema Admin
} else if (userRole === 'clinic') {
  navigate('/clinic-dashboard');      // Clínica (dinâmico)
} else if (userRole === 'vet') {
  navigate('/vet-dashboard');         // Veterinário
} else {
  navigate('/demands');               // Fallback
}
```

### ClinicDashboardPage.tsx

```typescript
const { role: clinicRole } = usePermissions();

const getDashboardConfig = () => {
  switch (clinicRole) {
    case 'CADMIN':
      return {
        title: 'Painel do Administrador',
        component: <AdminDashboard />,
        menuItems: getAdminMenuItems(),
        fabOptions: getAdminFabOptions(),
      };
    
    case 'CMANAGER':
      return {
        title: `Painel - ${selectedUnit.name}`,
        component: <ManagerDashboard />,
        menuItems: getManagerMenuItems(),
        fabOptions: getManagerFabOptions(),
      };
    
    case 'CASSISTANT':
      return {
        title: 'Painel do Assistente',
        component: <AssistantDashboard />,
        menuItems: getAssistantMenuItems(),
        fabOptions: getAssistantFabOptions(),
      };
    
    case 'CVET_INTERNAL':
      return {
        title: 'Meu Painel',
        component: <VetInternalDashboard />,
        menuItems: getVetInternalMenuItems(),
        fabOptions: getVetInternalFabOptions(),
      };
    
    default:
      // Clinic owner sem clinic_user role
      return defaultConfig;
  }
};
```

---

## 📊 Comparação: Antes vs. Depois

### ❌ **Antes**
```
ClinicDashboardPage.tsx (600+ linhas)
  ├── Conteúdo fixo
  ├── Menu fixo
  └── Sem distinção de roles
```

**Problemas:**
- Código monolítico
- Difícil manutenção
- Sem personalização por role
- Mistura de responsabilidades

### ✅ **Depois**
```
ClinicDashboardPage.tsx (300 linhas)
  ├── getDashboardConfig() - Router lógico
  ├── getMenuItems() - Menu dinâmico por role
  ├── getFabOptions() - FAB dinâmico por role
  └── Renderiza componente específico
      ├── AdminDashboard.tsx (CADMIN)
      ├── ManagerDashboard.tsx (CMANAGER)
      ├── AssistantDashboard.tsx (CASSISTANT)
      └── VetInternalDashboard.tsx (CVET_INTERNAL)
```

**Benefícios:**
- ✅ Código modular e organizado
- ✅ Fácil manutenção e testes
- ✅ Experiência personalizada por role
- ✅ Escalável para novos roles
- ✅ Separação clara de responsabilidades

---

## 🎨 Componentes de Dashboard

### AdminDashboard.tsx
**Seções:**
- `resumo` - Visão geral com stats de todas as unidades
- `audit` - Logs de auditoria

**Stats:**
- 🏥 Unidades Ativas
- 👥 Usuários Ativos
- 📋 Demandas Abertas
- ⏳ Candidaturas Pendentes

### ManagerDashboard.tsx
**Seções:**
- `resumo` - Stats da unidade específica
- `profissionais` - Lista de profissionais aplicados
- `mensagens` - Mensagens recentes

**Features:**
- Atividade recente da unidade
- Stats específicos da unidade selecionada

### AssistantDashboard.tsx
**Seções:**
- `resumo` - Painel operacional
- `mensagens` - Comunicação

**Features:**
- Ações rápidas (Nova Demanda, Ver Candidaturas)
- Lista de demandas recentes

### VetInternalDashboard.tsx
**Seções:**
- `resumo` - Resumo pessoal
- `mensagens` - Comunicação
- `avaliacoes` - Sistema de avaliações

**Features:**
- Próximos agendamentos
- Novas oportunidades internas
- Avaliações recebidas

---

## 🔐 Sistema de Permissões

### usePermissions Hook

```typescript
const { 
  role,                    // 'CADMIN' | 'CMANAGER' | etc
  permissions,             // Array de permissões
  hasPermission,           // Função para checar permissão
  canCreateUnit,           // Flags de conveniência
  canInviteUser,
  // ... mais flags
} = usePermissions();
```

### Verificação de Permissão

```typescript
// No componente
const { canCreateUnit } = usePermissions();

{canCreateUnit && (
  <button>Nova Unidade</button>
)}

// Ou manualmente
const { hasPermission } = usePermissions();

if (hasPermission('unit.create')) {
  // Mostrar UI
}
```

---

## 🧪 Como Testar

### 1. **Testar Admin do Sistema**
```typescript
// Criar usuário admin no Supabase
UPDATE auth.users 
SET user_metadata = jsonb_set(
  COALESCE(user_metadata, '{}'::jsonb), 
  '{role}', 
  '"admin"'
)
WHERE email = 'admin@petivet.com';
```

Login → Deve ir para `/admin-dashboard`

### 2. **Testar CADMIN de Clínica**
```typescript
// Clínica owner (sem clinic_user) → acesso completo
// OU
INSERT INTO clinic_users (user_id, clinic_id, unit_id, role, status)
VALUES ('user-uuid', 'clinic-uuid', 'unit-uuid', 'CADMIN', 'active');
```

Login → `/clinic-dashboard` → Ver dashboard de CADMIN

### 3. **Testar CMANAGER**
```typescript
INSERT INTO clinic_users (user_id, clinic_id, unit_id, role, status)
VALUES ('user-uuid', 'clinic-uuid', 'unit-uuid', 'CMANAGER', 'active');
```

Login → `/clinic-dashboard` → Ver dashboard de CMANAGER

### 4. **Testar CASSISTANT**
```typescript
INSERT INTO clinic_users (user_id, clinic_id, unit_id, role, status)
VALUES ('user-uuid', 'clinic-uuid', 'unit-uuid', 'CASSISTANT', 'active');
```

Login → `/clinic-dashboard` → Ver dashboard de CASSISTANT (UI reduzida)

### 5. **Testar CVET_INTERNAL**
```typescript
INSERT INTO clinic_users (user_id, clinic_id, unit_id, role, status)
VALUES ('user-uuid', 'clinic-uuid', 'unit-uuid', 'CVET_INTERNAL', 'active');
```

Login → `/clinic-dashboard` → Ver dashboard de veterinário interno

---

## 🚀 Próximos Passos

### Implementações Futuras

1. **Conectar APIs Reais**
   - Substituir dados mockados por chamadas reais
   - Implementar loading states
   - Tratamento de erros

2. **Analytics e Gráficos**
   - Adicionar Chart.js ou Recharts
   - Gráficos de demandas por período
   - Métricas de performance

3. **Audit Logs**
   - Implementar visualização completa
   - Filtros por tipo de ação
   - Exportação de logs

4. **Notificações em Tempo Real**
   - Integrar com Supabase Realtime
   - Push notifications
   - Badge de notificações

5. **Relatórios**
   - Geração de PDFs
   - Exportação para Excel
   - Relatórios customizáveis

---

## 📝 Notas Importantes

### 1. **Compatibilidade com Sistema Existente**
- Clínicas que já existem sem `clinic_user` continuam funcionando
- Sistema detecta ausência de `clinic_user.role` e usa configuração padrão
- Migração gradual é possível

### 2. **UnitContext**
- Usado apenas para clínicas com múltiplas unidades
- Se houver apenas 1 unidade, o selector não aparece
- Estado persiste no localStorage

### 3. **Loading States**
- `permissionsLoading` garante que role é carregado antes de renderizar
- Evita flickering de conteúdo

### 4. **Fallback**
- Se role não for reconhecido, usa configuração padrão
- Evita tela branca ou erro

---

## 🐛 Troubleshooting

### Problema: Dashboard não carrega conteúdo correto

**Solução:**
1. Verificar `clinic_user` no localStorage
2. Verificar role no banco de dados
3. Limpar cache do navegador
4. Verificar console para erros

### Problema: Menu items não aparecem

**Solução:**
1. Verificar se `usePermissions` está retornando role
2. Verificar função `getMenuItems()` no switch case
3. Verificar se role está correto na tabela `clinic_users`

### Problema: "Carregando..." infinito

**Solução:**
1. Verificar se `usePermissions` hook está funcionando
2. Verificar se `clinic_user` está no localStorage
3. Adicionar timeout para fallback

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar este guia
2. Verificar `MULTI_UNIT_SYSTEM_GUIDE.md`
3. Verificar console do navegador
4. Verificar logs do Supabase

---

**Versão:** 1.0.0  
**Data:** 29 de Outubro, 2025  
**Autor:** PetMi Vet Development Team

