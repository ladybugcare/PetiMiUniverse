<!-- ea360282-9aec-4e07-a8f7-6674338fed48 0f391f1a-2760-49aa-ad7c-4568be9e14bb -->
# Análise Completa do Projeto PetiVet

## 🔴 PONTOS CRÍTICOS (Urgente)

### 1. Segurança

#### 1.1 TypeScript Strict Mode Desabilitado no Frontend

- **Problema**: `frontend/tsconfig.json` tem `strict: false` e `noImplicitAny: false`
- **Risco**: Erros de tipo não detectados, bugs em produção
- **Impacto**: Alto - pode causar erros de runtime
- **Localização**: `frontend/tsconfig.json:14`

#### 1.2 Excesso de console.log no Código

- **Problema**: 357 ocorrências de `console.log/error/warn` no backend
- **Risco**: Vazamento de informações sensíveis em produção, performance degradada
- **Impacto**: Médio-Alto
- **Localização**: Múltiplos arquivos em `backend/src/`

#### 1.3 Validação de Upload de Arquivos Incompleta

- **Problema**: Validação apenas de tipo MIME (pode ser falsificado)
- **Risco**: Upload de arquivos maliciosos
- **Impacto**: Alto
- **Localização**: `backend/src/utils/vetDocumentUpload.ts`, `backend/src/utils/imageUpload.ts`

#### 1.4 CORS com Múltiplas Origens Hardcoded

- **Problema**: Lista de origens permitidas hardcoded em `app.ts`
- **Risco**: Manutenção difícil, possibilidade de esquecer novas origens
- **Impacto**: Médio
- **Localização**: `backend/src/app.ts:37-46`

#### 1.5 Falta de Validação de Tamanho de Payload Consistente

- **Problema**: Limite de 50MB pode ser muito alto para alguns endpoints
- **Risco**: Ataques de DoS, consumo excessivo de memória
- **Impacto**: Médio
- **Localização**: `backend/src/app.ts:95-96`

### 2. Estrutura e Arquitetura

#### 2.1 Inconsistência na Estrutura de Controllers

- **Problema**: Alguns controllers em subdiretórios (`controllers/vets/`), outros na raiz (`controllers/vetsController.ts`)
- **Risco**: Dificuldade de manutenção, falta de padrão
- **Impacto**: Médio
- **Localização**: `backend/src/controllers/`

#### 2.2 Falta de Camada de Serviço (Service Layer)

- **Problema**: Lógica de negócio misturada com controllers
- **Risco**: Código difícil de testar e reutilizar
- **Impacto**: Alto
- **Localização**: Todos os controllers

#### 2.3 Duplicação de Código

- **Problema**: Lógica similar repetida em múltiplos controllers (ex: validação de permissões)
- **Risco**: Bugs difíceis de corrigir, manutenção custosa
- **Impacto**: Médio
- **Localização**: Múltiplos controllers

#### 2.4 Falta de Tratamento de Erros Consistente

- **Problema**: Alguns controllers usam `try/catch`, outros não
- **Risco**: Erros não tratados podem quebrar a aplicação
- **Impacto**: Alto
- **Localização**: Múltiplos controllers

### 3. Banco de Dados

#### 3.1 Migrations Não Versionadas

- **Problema**: 60+ arquivos SQL sem sistema de versionamento adequado
- **Risco**: Dificuldade em rastrear ordem de execução, conflitos
- **Impacto**: Médio-Alto
- **Localização**: `backend/database_migrations/`

#### 3.2 Falta de Índices em Algumas Consultas Frequentes

- **Problema**: Queries podem estar lentas sem índices adequados
- **Risco**: Performance degradada com crescimento de dados
- **Impacto**: Médio
- **Localização**: Schema do banco

#### 3.3 Falta de Constraints de Integridade Referencial

- **Problema**: Algumas foreign keys podem não ter `ON DELETE CASCADE` adequado
- **Risco**: Dados órfãos, inconsistências
- **Impacto**: Médio
- **Localização**: Migrations SQL

### 4. Performance

#### 4.1 Falta de Cache em Endpoints Críticos

- **Problema**: Dados estáticos (especialidades, estados) são buscados repetidamente
- **Risco**: Sobrecarga desnecessária no banco
- **Impacto**: Médio
- **Localização**: Controllers de especialidades, IBGE API

#### 4.2 Paginação Não Implementada em Todos os Endpoints

- **Problema**: Alguns endpoints retornam todos os dados sem paginação
- **Risco**: Performance degradada com muitos registros
- **Impacto**: Alto
- **Localização**: `marketplaceController.ts`, `demandsController.ts`

#### 4.3 N+1 Query Problem Potencial

- **Problema**: Queries aninhadas podem causar múltiplas consultas ao banco
- **Risco**: Performance degradada
- **Impacto**: Médio
- **Localização**: Controllers com relacionamentos

### 5. Testes

#### 5.1 Cobertura de Testes Mínima

- **Problema**: Apenas 4 arquivos de teste encontrados
- **Risco**: Bugs não detectados, regressões
- **Impacto**: Alto
- **Localização**: `backend/src/__tests__/`, `frontend/src/utils/__tests__/`

#### 5.2 Falta de Testes E2E

- **Problema**: Nenhum teste end-to-end implementado
- **Risco**: Fluxos críticos não validados
- **Impacto**: Alto

#### 5.3 Testes Não Integrados ao CI/CD

- **Problema**: Não há pipeline de testes automatizados
- **Risco**: Bugs chegam em produção
- **Impacto**: Alto

### 6. Frontend

#### 6.1 Gerenciamento de Estado Descentralizado

- **Problema**: Estado gerenciado via localStorage e Context API misturado
- **Risco**: Inconsistências, dificuldade de debug
- **Impacto**: Médio-Alto
- **Localização**: `frontend/src/AuthContext.tsx`, `frontend/src/contexts/UnitContext.tsx`

#### 6.2 Componentes Muito Grandes

- **Problema**: Alguns componentes têm 900+ linhas (ex: `DemandsPage.tsx`)
- **Risco**: Dificuldade de manutenção, baixa reutilização
- **Impacto**: Médio
- **Localização**: `frontend/src/pages/DemandsPage.tsx`, `VetOnboardingPage.tsx`

#### 6.3 Falta de Error Boundaries

- **Problema**: Erros não tratados podem quebrar toda a aplicação
- **Risco**: Má experiência do usuário
- **Impacto**: Médio
- **Localização**: `frontend/src/`

#### 6.4 Dependências de localStorage Diretas

- **Problema**: Múltiplos acessos diretos a `localStorage.getItem('user')`
- **Risco**: Inconsistências, dificuldade de migração
- **Impacto**: Médio
- **Localização**: Múltiplos componentes

## 🟡 MELHORIAS SUGERIDAS (Importante)

### 1. Código e Qualidade

#### 1.1 Implementar ESLint/Prettier

- Padronizar formatação e detectar problemas
- Configurar regras específicas para TypeScript/React

#### 1.2 Adicionar Pre-commit Hooks

- Husky + lint-staged para validar código antes de commit
- Prevenir código quebrado no repositório

#### 1.3 Documentação de API

- Swagger já configurado mas pode ser expandido
- Adicionar exemplos de requisições/respostas

#### 1.4 Type Safety Melhorado

- Criar tipos compartilhados entre frontend/backend
- Usar tipos gerados do Supabase

### 2. Segurança

#### 2.1 Implementar Helmet.js

- Headers de segurança HTTP
- Proteção contra XSS, clickjacking, etc.

#### 2.2 Validação de Arquivos Mais Robusta

- Verificar assinatura de arquivo (magic numbers)
- Escanear arquivos por malware (opcional)

#### 2.3 Rate Limiting Mais Granular

- Diferentes limites por tipo de usuário
- Rate limiting por usuário autenticado, não apenas IP

#### 2.4 Sanitização de Inputs

- Sanitizar HTML em campos de texto
- Validar e sanitizar todos os inputs do usuário

### 3. Performance

#### 3.1 Implementar Redis para Cache

- Cache de queries frequentes
- Cache de sessões (opcional)

#### 3.2 Lazy Loading de Componentes

- Code splitting no frontend
- Carregar rotas sob demanda

#### 3.3 Otimização de Imagens

- Compressão automática de uploads
- Geração de thumbnails
- Lazy loading de imagens

#### 3.4 Database Query Optimization

- Usar `select()` específico em vez de `*`
- Implementar eager loading onde necessário
- Adicionar índices baseados em queries reais

### 4. Monitoramento e Observabilidade

#### 4.1 Implementar Logging Estruturado

- Winston já está configurado, mas pode ser melhorado
- Adicionar correlation IDs para rastrear requisições

#### 4.2 Métricas e APM

- Integrar Sentry ou similar para error tracking
- Métricas de performance (response time, throughput)

#### 4.3 Health Checks Melhorados

- Verificar dependências (Supabase, storage)
- Endpoint de readiness vs liveness

### 5. Testes

#### 5.1 Testes Unitários

- Cobrir lógica de negócio crítica
- Testar utilitários e helpers

#### 5.2 Testes de Integração

- Testar fluxos completos (signup → login → criar demanda)
- Mockar Supabase para testes

#### 5.3 Testes de Componentes

- React Testing Library para componentes críticos
- Testes de acessibilidade

## 🟢 MELHORIAS DE FEATURES

### 1. Funcionalidades Faltantes

#### 1.1 Sistema de Busca Avançada

- Busca full-text em demandas
- Filtros combinados (especialidade + localização + data)

#### 1.2 Notificações em Tempo Real

- WebSockets ou Supabase Realtime para notificações
- Notificações push para mobile

#### 1.3 Sistema de Avaliações

- Avaliação de veterinários por clínicas
- Sistema de reviews e ratings

#### 1.4 Histórico de Conversas

- Chat entre clínica e veterinário
- Histórico de mensagens (já mencionado em migrations)

#### 1.5 Relatórios e Analytics

- Dashboard com métricas para clínicas
- Relatórios de performance para veterinários

#### 1.6 Sistema de Favoritos

- Veterinários podem favoritar clínicas
- Clínicas podem favoritar veterinários

#### 1.7 Exportação de Dados

- Exportar demandas em PDF/Excel
- Relatórios exportáveis

### 2. UX/UI

#### 2.1 Loading States Consistentes

- Skeleton loaders em vez de spinners genéricos
- Estados de loading específicos por ação

#### 2.2 Feedback Visual Melhorado

- Toasts mais informativos
- Confirmações antes de ações destrutivas

#### 2.3 Responsividade Mobile

- Melhorar experiência mobile
- Testar em diferentes tamanhos de tela

#### 2.4 Acessibilidade

- ARIA labels adequados
- Navegação por teclado
- Contraste de cores adequado

#### 2.5 Internacionalização (i18n)

- Suporte a múltiplos idiomas
- Formatação de datas/números por região

### 3. Performance Frontend

#### 3.1 Virtualização de Listas

- React Window para listas longas
- Melhorar performance de renderização

#### 3.2 Memoização

- useMemo/useCallback onde apropriado
- React.memo para componentes pesados

#### 3.3 Service Worker

- Cache de assets estáticos
- Offline support básico

## 📋 PRIORIZAÇÃO RECOMENDADA

### Fase 1 (Crítico - 1-2 semanas)

1. ✅ Habilitar TypeScript strict mode no frontend
2. ✅ Substituir console.log por logger estruturado
3. ✅ Implementar validação robusta de uploads
4. ✅ Adicionar Error Boundaries no frontend
5. ✅ Implementar paginação em todos os endpoints

### Fase 2 (Importante - 2-4 semanas)

1. ✅ Refatorar estrutura de controllers (service layer)
2. ✅ Implementar testes unitários críticos
3. ✅ Adicionar Helmet.js e melhorias de segurança
4. ✅ Implementar cache para dados estáticos
5. ✅ Otimizar queries do banco de dados

### Fase 3 (Melhorias - 1-2 meses)

1. ✅ Implementar sistema de busca avançada
2. ✅ Adicionar notificações em tempo real
3. ✅ Melhorar UX/UI (loading states, feedback)
4. ✅ Implementar sistema de avaliações
5. ✅ Adicionar relatórios e analytics

## 📊 MÉTRICAS DE QUALIDADE ATUAIS

- **Cobertura de Testes**: ~2% (crítico)
- **TypeScript Strict**: Backend ✅ | Frontend ❌
- **Documentação API**: Parcial (Swagger configurado)
- **Logging**: Estruturado (Winston) mas com muitos console.log
- **Error Handling**: Parcial (middleware existe mas não usado consistentemente)
- **Security**: Básico (rate limiting, CORS, mas falta validações robustas)

## 🎯 CONCLUSÃO

O projeto tem uma base sólida com boas práticas implementadas (Winston, rate limiting, error handler), mas precisa de melhorias críticas em:

1. **Segurança**: Validações mais robustas, TypeScript strict
2. **Testes**: Cobertura mínima precisa ser expandida drasticamente
3. **Estrutura**: Service layer, padronização de controllers
4. **Performance**: Cache, paginação, otimização de queries
5. **Frontend**: Error boundaries, gerenciamento de estado mais robusto

A priorização sugerida permite resolver os problemas mais críticos primeiro, depois melhorar gradualmente a qualidade e adicionar features.

---

## 📋 PLANO DETALHADO DE IMPLEMENTAÇÃO EM FASES

### FASE 0: Preparação e Fundação (Semana 1)

**Objetivo**: Criar base sólida para mudanças futuras

#### 0.1 Setup de Ferramentas

- Configurar ESLint + Prettier com regras TypeScript/React
- Configurar Husky + lint-staged para pre-commit hooks
- Configurar CI/CD básico (GitHub Actions ou similar)
- Criar estrutura de branches (main, develop, feature/*)

#### 0.2 Documentação de Processo

- Documentar padrões de código (Code Style Guide)
- Criar templates de PR e issues
- Documentar processo de deploy
- Criar guia de contribuição

**Entregáveis**:

- `.eslintrc.js`, `.prettierrc`, `.husky/` configurados
- CI/CD rodando testes básicos
- Documentação de processos criada

---

### FASE 1: Segurança e Qualidade Crítica (Semanas 2-3)

**Objetivo**: Resolver problemas críticos de segurança e qualidade

#### 1.1 TypeScript Strict Mode (3 dias)

- Habilitar `strict: true` no `frontend/tsconfig.json`
- Corrigir erros de tipo gradualmente (começar pelos mais críticos)
- Adicionar `@ts-expect-error` apenas onde necessário com comentários
- Criar tipos compartilhados entre frontend/backend

**Estratégia**:

- Fazer em branch separada (`feature/typescript-strict`)
- Corrigir arquivo por arquivo, começando pelos mais usados
- Usar `// @ts-expect-error` temporariamente com TODO para revisar depois

#### 1.2 Tratamento de Erros Padronizado (5 dias)

- Refatorar todos os controllers para usar `asyncHandler`
- Substituir `console.log/error` por `logger` estruturado
- Criar classes de erro customizadas (ValidationError, NotFoundError, etc.)
- Garantir que todos os erros passem pelo `errorHandler` middleware
- Adicionar correlation IDs para rastreamento

**Estratégia**:

- Criar classes de erro em `backend/src/utils/errors.ts`
- Refatorar um controller por vez
- Testar cada refatoração antes de prosseguir

#### 1.3 Validação de Uploads Robusta (2 dias)

- Implementar validação por magic numbers (assinatura de arquivo)
- Adicionar sanitização de nomes de arquivo
- Implementar verificação de tamanho mais granular
- Adicionar rate limiting específico para uploads

#### 1.4 Error Boundaries no Frontend (2 dias)

- Criar componente `ErrorBoundary` genérico
- Adicionar Error Boundaries em rotas principais
- Implementar página de erro amigável
- Adicionar logging de erros do frontend (Sentry ou similar)

**Entregáveis**:

- TypeScript strict habilitado (com erros corrigidos)
- Todos os controllers usando tratamento de erros padronizado
- Uploads com validação robusta
- Error Boundaries implementados

---

### FASE 2: Arquitetura e Estrutura (Semanas 4-6)

**Objetivo**: Melhorar arquitetura e facilitar manutenção

#### 2.1 Service Layer (1 semana)

- Criar estrutura de serviços (`backend/src/services/`)
- Mover lógica de negócio dos controllers para services
- Refatorar controllers para serem "thin" (apenas recebem request e chamam service)
- Criar interfaces para services (facilita testes)

**Estrutura proposta**:

```
backend/src/services/
├── auth/
│   ├── AuthService.ts
│   └── TokenService.ts
├── clinics/
│   ├── ClinicService.ts
│   └── ClinicValidationService.ts
├── vets/
│   ├── VetService.ts
│   └── VetOnboardingService.ts
└── demands/
    ├── DemandService.ts
    └── DemandPositionService.ts
```

#### 2.2 Padronização de Controllers (3 dias)

- Consolidar estrutura (todos em subdiretórios ou todos na raiz)
- Criar base controller com métodos comuns
- Padronizar nomes de métodos (getAll, getById, create, update, delete)
- Documentar padrões de controllers

#### 2.3 Gerenciamento de Estado Frontend (1 semana)

- Avaliar necessidade de Redux/Zustand (ou manter Context API)
- Criar hooks customizados para lógica compartilhada
- Refatorar acesso direto ao localStorage
- Criar camada de abstração para storage

**Estratégia**:

- Se Context API suficiente, melhorar estrutura atual
- Se complexidade alta, considerar Zustand (mais leve que Redux)

**Entregáveis**:

- Service layer implementado
- Controllers padronizados e "thin"
- Estado do frontend melhor organizado

---

### FASE 3: Performance e Escalabilidade (Semanas 7-9)

**Objetivo**: Melhorar performance e preparar para escala

#### 3.1 Paginação Universal (3 dias)

- Criar helper de paginação reutilizável
- Implementar paginação em todos os endpoints de listagem
- Adicionar metadata de paginação nas respostas
- Atualizar frontend para usar paginação

#### 3.2 Cache Strategy (1 semana)

- Implementar cache in-memory para dados estáticos (especialidades, estados)
- Adicionar TTL (Time To Live) para cache
- Criar sistema de invalidação de cache
- Considerar Redis para produção (opcional nesta fase)

**Dados para cache**:

- Especialidades (TTL: 1 hora)
- Estados e cidades IBGE (TTL: 24 horas)
- Configurações do sistema (TTL: 30 minutos)

#### 3.3 Otimização de Queries (1 semana)

- Analisar queries lentas (usar EXPLAIN ANALYZE)
- Adicionar índices necessários
- Otimizar queries com N+1 problem
- Implementar eager loading onde necessário

#### 3.4 Code Splitting Frontend (2 dias)

- Implementar lazy loading de rotas
- Code splitting por rota
- Otimizar bundle size
- Adicionar loading states durante carregamento

**Entregáveis**:

- Todos os endpoints com paginação
- Cache implementado para dados estáticos
- Queries otimizadas
- Frontend com code splitting

---

### FASE 4: Testes e Qualidade (Semanas 10-12)

**Objetivo**: Garantir qualidade através de testes

#### 4.1 Testes Unitários (2 semanas)

- Configurar Jest/Vitest completamente
- Criar testes para services (lógica de negócio)
- Criar testes para utilitários (validações, helpers)
- Alcançar 60%+ de cobertura em código crítico

**Prioridade de testes**:

1. Services de autenticação
2. Services de validação
3. Utilitários de upload
4. Lógica de permissões

#### 4.2 Testes de Integração (1 semana)

- Configurar ambiente de testes (banco de dados de teste)
- Criar testes para fluxos críticos (signup → login → criar demanda)
- Testes de API endpoints principais
- Mockar Supabase para testes

#### 4.3 Testes E2E (opcional, 1 semana)

- Configurar Playwright ou Cypress
- Criar testes para fluxos principais
- Integrar no CI/CD

**Entregáveis**:

- 60%+ de cobertura de testes unitários
- Testes de integração para fluxos críticos
- CI/CD rodando testes automaticamente

---

### FASE 5: Segurança Avançada (Semanas 13-14)

**Objetivo**: Implementar melhorias de segurança

#### 5.1 Helmet.js e Headers (2 dias)

- Instalar e configurar Helmet.js
- Configurar headers de segurança
- Testar configuração

#### 5.2 Rate Limiting Avançado (3 dias)

- Implementar rate limiting por usuário autenticado
- Diferentes limites por tipo de usuário
- Rate limiting por endpoint específico

#### 5.3 Sanitização de Inputs (3 dias)

- Implementar sanitização de HTML
- Validar e sanitizar todos os inputs
- Proteção contra XSS

#### 5.4 Auditoria e Logging (2 dias)

- Implementar audit log para ações críticas
- Melhorar logging estruturado
- Adicionar correlation IDs em todas as requisições

**Entregáveis**:

- Helmet.js configurado
- Rate limiting avançado
- Inputs sanitizados
- Sistema de auditoria funcionando

---

### FASE 6: Features e Melhorias (Semanas 15+)

**Objetivo**: Adicionar features e melhorias de UX

#### 6.1 Busca Avançada (1 semana)

- Implementar busca full-text no backend
- Adicionar filtros combinados
- Melhorar UI de busca no frontend

#### 6.2 Notificações em Tempo Real (1 semana)

- Configurar Supabase Realtime
- Implementar notificações push
- Adicionar badge de notificações não lidas

#### 6.3 Sistema de Avaliações (1 semana)

- Criar schema de avaliações
- Implementar CRUD de avaliações
- Adicionar UI de avaliações

#### 6.4 Melhorias de UX (contínuo)

- Skeleton loaders
- Feedback visual melhorado
- Acessibilidade (ARIA labels, navegação por teclado)
- Responsividade mobile melhorada

**Entregáveis**:

- Busca avançada funcionando
- Notificações em tempo real
- Sistema de avaliações
- UX melhorada

---

## 🔧 PLANO DETALHADO: TRATAMENTO DE ERROS

### Situação Atual

- ✅ Existe `errorHandler` middleware
- ✅ Existe `asyncHandler` wrapper
- ❌ Não usado consistentemente
- ❌ Muitos `console.error` diretos
- ❌ Tratamento de erro inconsistente entre controllers
- ❌ Falta classes de erro customizadas

### Estrutura Proposta

#### 1. Classes de Erro Customizadas

Criar arquivo `backend/src/utils/errors.ts` com:

- `AppError` (classe base)
- `ValidationError` (400)
- `NotFoundError` (404)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `ConflictError` (409)
- `DatabaseError` (500)

#### 2. Error Handler Melhorado

Atualizar `errorHandler.ts` para:

- Usar classes de erro customizadas
- Adicionar correlation IDs
- Melhorar logging estruturado
- Não vazar detalhes em produção

#### 3. Async Handler Melhorado

Melhorar `asyncHandler` para:

- Converter erros do Supabase automaticamente
- Passar AppErrors diretamente
- Tratar erros não esperados

#### 4. Padrão de Uso nos Controllers

**ANTES**:

```typescript
export const createVet = async (req: Request, res: Response) => {
  try {
    // validação manual
    if (!name) {
      return res.status(400).json({ error: 'Nome obrigatório' });
    }
    // ...
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
};
```

**DEPOIS**:

```typescript
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ValidationError, DatabaseError } from '../utils/errors.js';

export const createVet = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  
  if (!name) {
    throw new ValidationError('Nome é obrigatório');
  }

  const { data, error } = await supabase.from('vets').insert({...});

  if (error) {
    throw new DatabaseError('Erro ao criar veterinário', error);
  }

  res.status(201).json({ vet: data });
});
```

### Plano de Migração

**Passo 1**: Criar classes de erro (1 dia)

- Criar `backend/src/utils/errors.ts`
- Exportar todas as classes

**Passo 2**: Melhorar errorHandler (1 dia)

- Atualizar `errorHandler.ts` para usar classes de erro
- Adicionar correlation IDs

**Passo 3**: Refatorar controllers gradualmente (1 por vez)

- Começar pelos mais críticos (auth, vets, clinics)
- Usar `asyncHandler` em todas as rotas
- Substituir `res.status().json()` por `throw new ErrorClass()`
- Substituir `console.error` por `logger.error`

**Ordem sugerida**:

1. `auth.ts` (crítico)
2. `vetsController.ts` e `vets/*.ts`
3. `clinicsController.ts` e `clinics/*.ts`
4. `demandsController.ts`
5. Resto dos controllers

**Passo 4**: Testar cada refatoração

- Testar fluxo completo após cada controller
- Verificar logs
- Verificar respostas de erro

**Passo 5**: Documentar padrões

- Criar guia de tratamento de erros
- Adicionar exemplos na documentação

### Benefícios da Nova Estrutura

1. **Consistência**: Todos os erros seguem o mesmo padrão
2. **Rastreabilidade**: Correlation IDs facilitam debug
3. **Manutenibilidade**: Classes de erro facilitam tratamento específico
4. **Logging**: Logs estruturados facilitam análise
5. **Segurança**: Detalhes de erro não vazam em produção
6. **Testabilidade**: Erros podem ser testados facilmente

### To-dos

- [ ] Habilitar TypeScript strict mode no frontend (tsconfig.json)
- [ ] Substituir console.log por logger estruturado em todos os arquivos do backend
- [ ] Implementar validação robusta de uploads (magic numbers, sanitização)
- [ ] Adicionar Error Boundaries no frontend para capturar erros de renderização
- [ ] Implementar paginação em todos os endpoints que retornam listas
- [ ] Criar camada de serviço (service layer) e refatorar controllers
- [ ] Implementar testes unitários para lógica crítica de negócio
- [ ] Adicionar Helmet.js para headers de segurança HTTP
- [ ] Implementar cache (Redis ou in-memory) para dados estáticos
- [ ] Analisar e adicionar índices necessários nas tabelas do banco