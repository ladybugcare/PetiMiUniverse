<!-- 74744d77-175a-4350-a835-fff96662f6c7 a6caf80e-d7f6-4ed9-bc24-7b385ab53f06 -->
# Planejamento: Relatório de Clínicas

## Análise do Estado Atual

### ✅ O que já está implementado:

1. **Endpoints Backend** (em `/statistics/clinic/:clinicId/reports/`):

- `GET /overview` - Resumo geral com métricas principais
- `GET /demands` - Detalhes de demandas
- `GET /professionals` - Profissionais contratados

2. **Métricas já disponíveis**:

- Total de demandas criadas (com filtro de período)
- Demandas por status (open, in_progress, closed, cancelled)
- Profissionais contratados no período
- Tempo médio de preenchimento (averageFillTime)
- Taxa de sucesso por especialidade
- Lista detalhada de demandas com posições
- Lista de profissionais contratados

3. **Filtros implementados**:

- Período: 7d, 30d, 90d (suporta custom com startDate/endDate)
- Unidades: multiselect via `unit_ids` query parameter

4. **Frontend**:

- Página `ClinicReportsPage.tsx` com 3 abas (Overview, Demandas, Profissionais)
- Filtros de período e unidades funcionais
- Visualização organizada dos dados

### ⚠️ Diferenças encontradas:

1. **Caminho dos endpoints**: 

- Atual: `/statistics/clinic/:clinicId/reports/...`
- Sugerido: `/clinics/:clinicId/reports/...`
- **Decisão**: Manter atual (mais organizado) ou criar aliases

2. **Status "concluídas"**: 

- Sistema usa `closed` (equivalente a concluídas)
- Status "ativas" = `open` + `in_progress`

## Melhorias Sugeridas

### 1. Métricas Adicionais (Backend)

**Arquivo**: `backend/src/controllers/reportsController.ts`

- **Total de candidaturas recebidas**: Contar todas as `position_applications` (não apenas aceitas)
- **Taxa de conversão**: (candidaturas aceitas / total de candidaturas) × 100
- **Tempo médio de resposta**: Tempo entre criação da demanda e primeira candidatura
- **Taxa de preenchimento por unidade**: Métricas separadas por unidade
- **Especialidades mais demandadas**: Ranking das especialidades mais solicitadas
- **Taxa de cancelamento**: Percentual de demandas canceladas

### 2. Visualizações e Gráficos (Frontend)

**Arquivo**: `frontend/src/pages/ClinicReportsPage.tsx`

- Adicionar gráficos de linha para evolução temporal
- Gráfico de pizza para distribuição por status
- Gráfico de barras para especialidades
- Comparação com período anterior (opcional)

### 3. Exportação de Dados

- Botão para exportar relatório em PDF
- Exportação em CSV/Excel
- Compartilhamento de relatórios

### 4. Melhorias de UX

- Adicionar período "custom" com seletor de datas
- Loading states mais informativos
- Mensagens quando não há dados
- Tooltips explicativos nas métricas
- Cards com variação percentual (comparação com período anterior)

### 5. Validações e Testes

- Testar todos os endpoints com diferentes períodos
- Validar filtros de unidades
- Verificar cálculos de métricas
- Testar com dados vazios

## Implementação Proposta

### Fase 1: Validação e Correções

1. Testar endpoints existentes
2. Validar cálculos de métricas
3. Verificar filtros de período e unidades
4. Corrigir bugs encontrados

### Fase 2: Métricas Adicionais

1. Adicionar contagem de candidaturas totais
2. Calcular taxa de conversão
3. Adicionar tempo médio de resposta
4. Implementar métricas por unidade

### Fase 3: Melhorias de UI/UX

1. Adicionar gráficos (usar biblioteca como recharts ou chart.js)
2. Implementar período custom com date picker
3. Melhorar loading states
4. Adicionar tooltips e ajuda contextual

### Fase 4: Exportação (Opcional)

1. Implementar exportação PDF
2. Implementar exportação CSV
3. Adicionar botões de ação na interface

## Arquivos Principais a Modificar

1. **Backend**:

- `backend/src/controllers/reportsController.ts` - Adicionar novas métricas
- `backend/src/routes/statistics.ts` - Manter rotas (ou adicionar aliases)

2. **Frontend**:

- `frontend/src/pages/ClinicReportsPage.tsx` - Melhorar UI e adicionar gráficos
- `frontend/src/services/reportsApi.ts` - Adicionar tipos para novas métricas
- Criar componentes de gráficos (se necessário)

## Notas Importantes

- O sistema já está funcional e atende a maioria dos requisitos
- As melhorias são incrementais e não quebram funcionalidades existentes
- Considerar performance ao adicionar muitas métricas simultaneamente
- Manter compatibilidade com a estrutura de dados existente