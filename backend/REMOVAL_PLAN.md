# Plano de Remoção de Endpoints e Métodos Deprecated

## Data de Criação
2025-01-XX

## Objetivo
Este documento lista os endpoints, métodos e rotas que foram marcados como deprecated e devem ser removidos após um período de migração completo.

---

## Endpoints e Métodos a Remover

### Backend

#### 1. Rota `POST /api/demands/create`
- **Arquivo**: `backend/src/routes/demands.ts`
- **Substituído por**: `POST /api/demands` (createDemandV2)
- **Status**: Deprecated
- **Data estimada de remoção**: Após 3 meses de migração completa

#### 2. Método `createDemand` em `demandsController.ts`
- **Arquivo**: `backend/src/controllers/demandsController.ts`
- **Substituído por**: `createDemandV2`
- **Status**: Deprecated
- **Data estimada de remoção**: Após 3 meses de migração completa

#### 3. Rota `POST /api/demand-positions/composite`
- **Arquivo**: `backend/src/routes/demandPositions.ts`
- **Substituído por**: `POST /api/demands` (createDemandV2)
- **Status**: Deprecated
- **Data estimada de remoção**: Após 3 meses de migração completa

#### 4. Método `createCompositeDemand` em `demandPositionsController.ts`
- **Arquivo**: `backend/src/controllers/demandPositionsController.ts`
- **Substituído por**: `createDemandV2` em `demandsController.ts`
- **Status**: Deprecated
- **Data estimada de remoção**: Após 3 meses de migração completa

### Frontend

#### 5. Método `create` em `demandsApi.ts`
- **Arquivo**: `frontend/src/services/demandsApi.ts`
- **Substituído por**: `createV2`
- **Status**: Deprecated
- **Data estimada de remoção**: Após 3 meses de migração completa

#### 6. Método `createCompositeDemand` em `demandPositionsApi.ts`
- **Arquivo**: `frontend/src/services/demandPositionsApi.ts`
- **Substituído por**: `demandsApi.createV2`
- **Status**: Deprecated
- **Data estimada de remoção**: Após 3 meses de migração completa

---

## Checklist de Verificação Antes de Remover

Antes de remover qualquer endpoint ou método, verificar:

- [ ] Nenhum código no frontend usa os métodos deprecated
- [ ] Nenhum código no backend usa os métodos deprecated
- [ ] Nenhum teste depende dos métodos deprecated
- [ ] Nenhuma documentação externa referencia os endpoints deprecated
- [ ] Logs de produção não mostram uso dos endpoints deprecated há pelo menos 1 mês
- [ ] Todos os clientes foram migrados para os novos endpoints
- [ ] Backup do código foi feito antes da remoção

---

## Passos para Remoção

1. **Verificar uso em produção**
   - Analisar logs de acesso aos endpoints deprecated
   - Verificar se há requisições recentes (últimos 30 dias)

2. **Remover do código**
   - Remover rotas de `routes/demands.ts` e `routes/demandPositions.ts`
   - Remover métodos de `demandsController.ts` e `demandPositionsController.ts`
   - Remover métodos de `demandsApi.ts` e `demandPositionsApi.ts`
   - Remover interfaces/types relacionados (se não usados em outros lugares)

3. **Atualizar documentação**
   - Remover referências aos endpoints deprecated
   - Atualizar documentação da API

4. **Testes**
   - Executar testes completos após remoção
   - Verificar que nenhum teste quebra

---

## Notas Importantes

- **Não remover antes do período de migração**: Manter endpoints deprecated por pelo menos 3 meses após o lançamento da V2
- **Monitorar uso**: Verificar logs regularmente para garantir que ninguém está usando os endpoints antigos
- **Comunicar mudanças**: Notificar equipe e usuários sobre a remoção planejada com antecedência

---

## Histórico de Mudanças

- **2025-01-XX**: Documento criado com lista inicial de endpoints deprecated

