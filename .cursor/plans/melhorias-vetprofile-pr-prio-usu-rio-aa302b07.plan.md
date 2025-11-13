<!-- aa302b07-3638-4ad9-a439-85b8e517246a d0dbcd94-ee9c-4897-a0d0-58cfc707757a -->
# Redesign Completo do VetProfilePage - Layout Moderno de Duas Colunas

## Objetivo

Redesenhar completamente a página de perfil do veterinário com um layout moderno de duas colunas (lado esquerdo fixo + lado direito scrollável), implementando melhorias significativas de UX/UI, funcionalidades avançadas de perfil profissional e dividindo o desenvolvimento em 3 fases bem definidas.

## Análise Atual

A página `VetProfilePage` atualmente exibe:

- Informações básicas: nome, email, CRMV, especialidades, certificados, experiência
- Modo de edição para o próprio perfil
- Upload de foto

**O que falta:**

- Estatísticas profissionais (candidaturas, trabalhos, etc.)
- Campos adicionais disponíveis no banco (telefone, endereço, bio, documento)
- Status do perfil (aprovado/pendente)
- Links rápidos para ações importantes
- Visualização melhorada de especialidades (mostrar nomes ao invés de UUIDs)

## Melhorias Propostas

### 1. Seção de Estatísticas Profissionais

**Arquivo:** `frontend/src/pages/VetProfilePage.tsx`

Adicionar cards de estatísticas quando `isOwnProfile === true`:

- Total de candidaturas
- Trabalhos ativos
- Trabalhos concluídos
- Candidaturas pendentes
- Oportunidades disponíveis
- Avaliação média (quando disponível)

**API:** Usar `statisticsApi.getVetStats(vetId)` já existente em `frontend/src/services/statisticsApi.ts`

### 2. Campos Adicionais do Perfil

**Arquivo:** `frontend/src/pages/VetProfilePage.tsx`

Adicionar campos editáveis quando `isOwnProfile === true`:

- **Telefone** (`phone`) - campo de texto editável
- **Endereço** (`address`) - textarea editável
- **Biografia** (`bio`) - textarea editável (se disponível no banco)
- **Tipo de Documento** (`document_type`) - select CPF/CNPJ (somente leitura)
- **Número do Documento** (`document_number`) - campo somente leitura (mascarado)

### 3. Status do Perfil

**Arquivo:** `frontend/src/pages/VetProfilePage.tsx`

Exibir badge de status:

- **Aprovado** (verde) - quando `status === 'active'` e aprovado
- **Pendente** (amarelo) - quando aguardando aprovação
- **Rejeitado** (vermelho) - quando rejeitado
- **Inativo** (cinza) - quando inativo

### 4. Links Rápidos e Ações

**Arquivo:** `frontend/src/pages/VetProfilePage.tsx`

Adicionar seção de "Ações Rápidas" com botões:

- Ver Minhas Candidaturas → `/my-applications`
- Ver Demandas Disponíveis → `/demands`
- Ver Mensagens → `/messages`
- Ver Marketplace → `/marketplace`
- Configurações → `/settings` (se existir)

### 5. Melhorar Visualização de Especialidades

**Arquivo:** `frontend/src/pages/VetProfilePage.tsx`

Atualmente as especialidades são exibidas como UUIDs. Verificar se há uma tabela de especialidades e buscar os nomes reais, ou pelo menos melhorar a formatação.

### 6. Informações de Conta

**Arquivo:** `frontend/src/pages/VetProfilePage.tsx`

Adicionar seção "Informações da Conta" (somente para próprio perfil):

- Data de criação da conta (`created_at`)
- Última atualização (`updated_at`)
- Status da verificação de email (se disponível)

## Implementação

### Arquivos a Modificar

1. **`frontend/src/pages/VetProfilePage.tsx`**

   - Adicionar estado para estatísticas
   - Adicionar campos adicionais ao `formData`
   - Criar componente de cards de estatísticas
   - Adicionar seção de links rápidos
   - Adicionar exibição de status
   - Melhorar layout com seções organizadas

2. **`frontend/src/services/vetsApi.ts`** (se necessário)

   - Verificar se a interface `Vet` inclui todos os campos (`phone`, `address`, `bio`, `document_type`, `document_number`)

### Estrutura da Página Melhorada

```
┌─────────────────────────────────────┐
│ Header: "Meu Perfil" + [Editar]     │
├─────────────────────────────────────┤
│ Foto de Perfil                      │
├─────────────────────────────────────┤
│ Status Badge (Aprovado/Pendente)    │
├─────────────────────────────────────┤
│ ESTATÍSTICAS (4 cards em grid)       │
│ - Candidaturas | Trabalhos Ativos   │
│ - Concluídos | Pendentes            │
├─────────────────────────────────────┤
│ INFORMAÇÕES PESSOAIS                 │
│ - Nome, Email, CRMV                 │
│ - Telefone, Endereço                │
│ - Documento (somente leitura)        │
├─────────────────────────────────────┤
│ ESPECIALIDADES E CERTIFICADOS        │
├─────────────────────────────────────┤
│ BIOGRAFIA/EXPERIÊNCIA                │
├─────────────────────────────────────┤
│ AÇÕES RÁPIDAS (botões)               │
│ - Ver Candidaturas                   │
│ - Ver Demandas                       │
│ - Mensagens, etc.                   │
├─────────────────────────────────────┤
│ INFORMAÇÕES DA CONTA                  │
│ - Data criação, última atualização   │
└─────────────────────────────────────┘
```

## Considerações Técnicas

### Compatibilidade

- Manter compatibilidade com visualização pública (quando `isPublicView === true`)
- Layout de duas colunas apenas para próprio perfil
- Visualização pública mantém layout simples de coluna única
- Estatísticas e ações rápidas aparecem APENAS quando `isOwnProfile === true`

### Performance

- Lado esquerdo fixo usa `position: sticky` para melhor performance
- Lazy loading de imagens de certificados
- Debounce em campos de edição
- Cache de estatísticas (evitar requisições desnecessárias)

### Acessibilidade

- Tooltips acessíveis via keyboard
- Contraste adequado em todos os elementos
- Labels descritivos em todos os campos
- Navegação por teclado funcional

### Responsividade

- Breakpoints: mobile (< 768px), tablet (768-1024px), desktop (> 1024px)
- Lado esquerdo vira accordion no mobile
- Grid de estatísticas adapta-se ao tamanho da tela
- Ações rápidas em formato de lista no mobile

### Segurança

- Campos sensíveis (documento) mascarados
- Validação de dados antes de salvar
- Confirmação para ações destrutivas (excluir conta)

## Dependências

- `statisticsApi.getVetStats()` - já existe
- `specialtiesApi.getAll()` - já existe (para resolver nomes de especialidades)
- Interface `Vet` já inclui todos os campos necessários
- Lucide React icons - já instalado
- Sistema de cores existente (`colors.ts`)

## Cores e Estilo

- Cor principal: `#7B61FF` (roxo) ou `#7c3aed` (já existente)
- Cinza suave para divisões: `#f3f4f6`
- Tipografia: Poppins para títulos, Inter para textos
- Espaçamento consistente: 16px, 24px, 32px

### To-dos

- [x] Adicionar seção de estatísticas profissionais usando statisticsApi.getVetStats() quando isOwnProfile === true
- [x] Adicionar campos adicionais ao formulário: telefone, endereço, bio (se disponível), e exibir documento (somente leitura)
- [x] Adicionar badge de status do perfil (Aprovado/Pendente/Rejeitado/Inativo) com cores apropriadas
- [x] Criar seção de 'Ações Rápidas' com botões para navegar para páginas importantes (candidaturas, demandas, mensagens, etc.)
- [x] Adicionar seção de informações da conta (data de criação, última atualização) visível apenas no próprio perfil
- [x] Melhorar visualização de especialidades (verificar se há API para buscar nomes ou melhorar formatação de UUIDs)
- [x] Verificar e atualizar interface Vet em vetsApi.ts para incluir todos os campos necessários (phone, address, bio, document_type, document_number)