# Sistema de Demandas com Posições Múltiplas - IMPLEMENTADO ✅

## Resumo da Implementação

Foi implementado um sistema completo de demandas compostas que permite criar uma demanda principal com múltiplas posições profissionais, cada uma com suas próprias vagas e especialidades.

## 🎯 Principais Funcionalidades

### 1. **Criação de Demandas Compostas (Clínicas)**
- Formulário atualizado com novo componente `DemandPositionsForm`
- Substituição de `duration_hours` por `start_time` e `end_time`
- Suporte para adicionar múltiplas posições profissionais:
  - Cada posição pode ter: especialidade, número de vagas, pagamento individual, descrição
  - No mínimo 1 posição, sem limite máximo
  - Resumo automático mostrando total de posições, vagas e investimento

### 2. **Sistema de Candidaturas Inteligente**
- Veterinários podem se candidatar a posições específicas
- Sistema automático de detecção de conflitos:
  - **Conflito de Mesma Demanda**: Se aceito em uma posição, outras candidaturas na mesma demanda são inativadas
  - **Conflito de Horário**: Se aceito em uma demanda, candidaturas conflitantes em outras demandas são inativadas automaticamente
- Status de candidatura:
  - `pending`: Aguardando análise
  - `accepted`: Aceito para a posição
  - `rejected`: Candidatura rejeitada
  - `inactive_accepted_other_position`: Aceito em outra posição da mesma demanda
  - `inactive_time_conflict`: Conflito de horário com outra demanda aceita
  - `cancelled_by_vet`: Cancelada pelo veterinário

### 3. **Gerenciamento de Vagas**
- Cada posição pode ter múltiplas vagas (ex: "2 Anestesistas")
- Sistema aceita candidatos até o limite de vagas
- Contador automático de vagas preenchidas vs. disponíveis
- Status da posição: `open`, `filled`, `cancelled`

### 4. **Visualização para Veterinários**
- Nova página `/vet-positions` com:
  - Lista de todas as posições disponíveis
  - Filtros por especialidade e status de candidatura
  - Cards informativos mostrando:
    - Título da demanda
    - Especialidade requerida
    - Vagas disponíveis (com barra de progresso)
    - Data, horário inicial e final
    - Pagamento por vaga
    - Status da candidatura (se já aplicou)
  - Modal para enviar mensagem ao candidatar-se

### 5. **Gerenciamento para Clínicas/Admin**
- Componente `PositionApplicationsManager` para:
  - Ver todos os candidatos de uma posição
  - Candidaturas organizadas por status (Pendentes, Aceitos, Outros)
  - Aceitar ou rejeitar candidatos com um clique
  - Visualizar informações detalhadas dos veterinários
  - Ver mensagens enviadas pelos candidatos

## 📦 Arquivos Criados/Modificados

### Backend
- ✅ `backend/database_migrations/petimi_vet/create_demand_positions_system.sql` - Migration completa
- ✅ `backend/src/controllers/demandPositionsController.ts` - Controlador da API
- ✅ `backend/src/routes/demandPositions.ts` - Rotas da API
- ✅ `backend/src/index.ts` - Registro das rotas

### Frontend
- ✅ `frontend/src/services/demandPositionsApi.ts` - API service
- ✅ `frontend/src/components/DemandPositionsForm.tsx` - Formulário de posições
- ✅ `frontend/src/components/DemandFormStep.tsx` - **MODIFICADO** para integrar posições
- ✅ `frontend/src/components/PositionCard.tsx` - Card de posição para vets
- ✅ `frontend/src/components/PositionApplicationsManager.tsx` - Gerenciador de candidaturas
- ✅ `frontend/src/pages/VetPositionsPage.tsx` - Página de posições para veterinários
- ✅ `frontend/src/App.tsx` - **MODIFICADO** com nova rota

## 🚀 Como Executar a Migration

### Passo 1: Conectar ao Supabase

Acesse o dashboard do Supabase e vá para **SQL Editor**.

### Passo 2: Executar a Migration

Copie e execute o conteúdo do arquivo:
```
backend/database_migrations/petimi_vet/create_demand_positions_system.sql
```

Esta migration irá:
1. Adicionar campos `is_composite` e `end_time` na tabela `demands`
2. Migrar dados existentes de `duration_hours` para `end_time`
3. Remover coluna `duration_hours`
4. Criar tabela `demand_positions`
5. Criar tabela `position_applications`
6. Criar view `positions_with_availability`
7. Criar função `check_time_conflict()`
8. Criar triggers automáticos para gerenciar conflitos

### Passo 3: Verificar se Funcionou

Execute esta query para verificar:
```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('demand_positions', 'position_applications')
ORDER BY table_name, ordinal_position;
```

Você deve ver as novas tabelas criadas.

## 🧪 Como Testar

### 1. Criar uma Demanda Composta (Clínica)

1. Login como clínica
2. Acesse "Criar Demanda"
3. Selecione categoria (ex: Veterinário)
4. Preencha título, descrição, data, horário inicial e final
5. No formulário de posições:
   - Primeira posição: Cirurgião, 1 vaga, R$ 800
   - Clique em "➕ Adicionar Outra Posição"
   - Segunda posição: Anestesista, 2 vagas, R$ 500
6. Veja o resumo: 2 posições, 3 vagas totais, R$ 1.800
7. Clique em "Criar Demanda"

### 2. Visualizar Posições (Veterinário)

1. Login como veterinário
2. Acesse `/vet-positions` ou "Posições Disponíveis" no menu
3. Veja todas as posições abertas
4. Filtre por especialidade
5. Clique em "Candidatar-se →" em uma posição
6. Escreva uma mensagem (opcional)
7. Confirme a candidatura

### 3. Gerenciar Candidatos (Clínica/Admin)

1. Login como clínica
2. Acesse a demanda criada
3. Use `PositionApplicationsManager` (pode ser integrado na página de detalhes)
4. Veja candidatos pendentes
5. Aceite um candidato
6. Observe que:
   - A vaga é preenchida automaticamente
   - Outras candidaturas do mesmo vet nesta demanda ficam inativas

### 4. Testar Conflito de Horário

1. Crie duas demandas no mesmo dia e horário
2. Como vet, candidate-se às duas
3. Como clínica, aceite o vet em uma delas
4. Observe que a candidatura na outra demanda fica `inactive_time_conflict`

## 🔌 Endpoints da API

```
POST   /demand-positions/composite                    # Criar demanda composta
GET    /demand-positions/available                    # Listar posições disponíveis
POST   /demand-positions/apply                        # Candidatar-se a uma posição
PATCH  /demand-positions/applications/:id/accept     # Aceitar candidato
PATCH  /demand-positions/applications/:id/reject     # Rejeitar candidato
GET    /demand-positions/positions/:id/applications  # Ver candidatos de uma posição
GET    /demand-positions/demands/:id/positions       # Ver posições de uma demanda
GET    /demand-positions/vets/:id/applications       # Ver candidaturas de um vet
PATCH  /demand-positions/applications/:id/cancel     # Cancelar candidatura (vet)
```

## 📊 Estrutura do Banco de Dados

### Tabela: `demands`
- Adicionado: `is_composite` (boolean)
- Adicionado: `end_time` (time)
- Removido: `duration_hours`

### Tabela: `demand_positions`
```
id                  UUID (PK)
master_demand_id    UUID (FK → demands)
specialty           TEXT
total_slots         INTEGER (vagas totais)
filled_slots        INTEGER (vagas preenchidas)
individual_payment  NUMERIC(10,2)
status              TEXT (open/filled/cancelled)
description         TEXT
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

### Tabela: `position_applications`
```
id              UUID (PK)
position_id     UUID (FK → demand_positions)
vet_id          UUID (FK → vets)
status          TEXT (pending/accepted/rejected/...)
message         TEXT
accepted_at     TIMESTAMP
inactive_reason TEXT
created_at      TIMESTAMP
updated_at      TIMESTAMP
UNIQUE(position_id, vet_id)  # Um vet só pode se candidatar 1x por posição
```

### View: `positions_with_availability`
Combina informações de `demand_positions` e `demands`, mostrando:
- Todas as colunas de ambas as tabelas
- `available_slots` (calculado: total_slots - filled_slots)
- `progress` (string "X/Y")

## 🎨 Componentes React

### `DemandPositionsForm`
- Props: `positions`, `onChange`
- Features:
  - Adicionar/remover posições
  - Campos: especialidade, vagas, pagamento, descrição
  - Resumo automático
  - Validação inline

### `PositionCard`
- Props: `position`, `onApply`, `onCancel`, `loading`
- Features:
  - Badges de status coloridos
  - Barra de progresso de vagas
  - Botões condicionais baseados em status
  - Formatação de data/hora/moeda

### `PositionApplicationsManager`
- Props: `positionId`, `positionDetails`, `onApplicationAccepted`
- Features:
  - Lista candidatos por status
  - Aceitar/rejeitar com confirmação
  - Mostra informações do vet
  - Exibe mensagens dos candidatos

## ⚙️ Lógica de Triggers (Automática)

### Quando uma candidatura é aceita:

1. **Inativa candidaturas da mesma demanda**:
   ```sql
   UPDATE position_applications
   SET status = 'inactive_accepted_other_position'
   WHERE vet_id = [vet_aceito]
     AND position_id IN (SELECT id FROM demand_positions 
                         WHERE master_demand_id = [mesma_demanda])
     AND status = 'pending'
   ```

2. **Inativa candidaturas com conflito de horário**:
   ```sql
   UPDATE position_applications
   SET status = 'inactive_time_conflict'
   WHERE vet_id = [vet_aceito]
     AND [data_e_horario_conflitam]
     AND status = 'pending'
   ```

3. **Incrementa filled_slots**:
   ```sql
   UPDATE demand_positions
   SET filled_slots = filled_slots + 1
   WHERE id = [position_id]
   ```

4. **Atualiza status se completou**:
   ```sql
   UPDATE demand_positions
   SET status = 'filled'
   WHERE id = [position_id] AND filled_slots >= total_slots
   ```

## 🔍 Queries Úteis para Testes

### Ver todas as posições disponíveis:
```sql
SELECT * FROM positions_with_availability;
```

### Ver candidaturas de uma posição:
```sql
SELECT pa.*, v.name, v.crmv
FROM position_applications pa
JOIN vets v ON pa.vet_id = v.id
WHERE pa.position_id = '[position_id]';
```

### Ver candidaturas de um vet:
```sql
SELECT pa.*, dp.specialty, d.title, d.demand_date
FROM position_applications pa
JOIN demand_positions dp ON pa.position_id = dp.id
JOIN demands d ON dp.master_demand_id = d.id
WHERE pa.vet_id = '[vet_id]';
```

### Verificar conflitos de horário para um vet:
```sql
SELECT * FROM check_time_conflict(
  '[vet_id]'::uuid,
  '2025-11-15'::date,
  '09:00'::time,
  '17:00'::time
);
```

## ✅ Status da Implementação

- [x] Migration do banco de dados
- [x] Backend controllers e routes
- [x] Frontend API service
- [x] Componente de formulário de posições
- [x] Integração com formulário de demanda
- [x] Componente de card de posição
- [x] Página de posições para veterinários
- [x] Componente de gerenciamento de candidaturas
- [x] Rotas no App.tsx
- [x] Compilação bem-sucedida (frontend)
- [x] Linter warnings corrigidos

## 🎉 Próximos Passos Recomendados

1. **Executar a migration no Supabase**
2. **Testar criação de demanda composta**
3. **Testar candidaturas de veterinários**
4. **Testar sistema de conflitos**
5. **Integrar PositionApplicationsManager nas páginas da clínica**
6. **Adicionar link no menu do veterinário para "/vet-positions"**
7. **Criar página de "Minhas Candidaturas" mostrando todas as applications do vet**
8. **Adicionar notificações em tempo real (opcional)**

## 📝 Notas Importantes

- ⚠️ A migration **remove** a coluna `duration_hours` das demandas existentes após migrar os dados para `end_time`
- ⚠️ Demandas antigas serão convertidas automaticamente (duration_hours → end_time)
- ✅ O sistema é **retrocompatível** - demandas simples (1 posição) funcionam normalmente
- ✅ Triggers funcionam automaticamente - não precisa chamar manualmente
- ✅ UNIQUE constraint garante que um vet só pode se candidatar 1x por posição
- ✅ CHECK constraints garantem integridade (filled_slots <= total_slots, etc.)

## 🐛 Troubleshooting

### Se a migration falhar:
1. Verifique se as tabelas `demands`, `vets` já existem
2. Verifique se não há constraints bloqueando
3. Execute a migration em partes (uma seção por vez)

### Se os triggers não funcionarem:
```sql
-- Verificar se triggers existem
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers
WHERE event_object_table = 'position_applications';

-- Recriar trigger se necessário
DROP TRIGGER IF EXISTS trigger_application_acceptance ON position_applications;
CREATE TRIGGER trigger_application_acceptance...
```

### Se houver erro de permissão ao compilar:
```bash
# Limpar cache e node_modules
rm -rf node_modules package-lock.json
npm install
npm run build:web
```

---

**Implementado com sucesso! 🚀**
Data: 29 de outubro de 2025

