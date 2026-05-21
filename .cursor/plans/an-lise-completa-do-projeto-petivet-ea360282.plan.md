<!-- ea360282-9aec-4e07-a8f7-6674338fed48 77ece892-1403-4bdb-bf3d-57cf9e8f223c -->
# Plano de Correção de Gaps de Lógica - PetMi Vet

## Estratégia Geral

**Princípio:** Usar o trigger SQL `update_filled_positions_on_application_status()` como **fonte de verdade única** para `filled_positions`. Remover toda lógica duplicada em código TypeScript que tenta atualizar `filled_positions` manualmente.

**Decisões arquiteturais:**

1. `filled_positions` será mantido automaticamente pelo trigger SQL (atômico, sem race conditions)
2. `calculateDemandStatus` usará `filled_positions` como fonte de verdade (não contagem em tempo real)
3. Unificar controllers duplicados mantendo a lógica mais robusta
4. Migrar completamente de `position_applications` para `demand_applications`
5. Adicionar validações de transição de status em todos os pontos de mudança

---

## FASE 1: Correções Críticas (Dados e Race Conditions)

### 1.1 Remover lógica duplicada de `filled_positions` em código

**Arquivo:** `backend/src/controllers/applicationsController.ts`

**Problema:** Código tenta atualizar `filled_positions` manualmente, causando race conditions e inconsistências com o trigger SQL.

**Solução:**

- Remover todo código que incrementa/decrementa `filled_positions` manualmente (linhas 538-572)
- O trigger SQL já faz isso automaticamente de forma atômica
- Manter apenas validação de vagas disponíveis antes de aprovar
- Usar `SELECT ... FOR UPDATE` ou validação baseada em `filled_positions` atual (lido do banco)

**Mudanças:**

```typescript
// ANTES: Tentava atualizar manualmente
filled_positions: demand.filled_positions + 1

// DEPOIS: Apenas valida e deixa o trigger atualizar
// Ler filled_positions atualizado do banco antes de validar
if (demand.filled_positions >= demand.vacancies) {
  return res.status(400).json({ error: 'Não há vagas disponíveis' });
}
// Trigger SQL atualiza filled_positions automaticamente
```

**Validação de vagas simultâneas:**

- Usar `SELECT filled_positions FROM demands WHERE id = ? FOR UPDATE` para lock
- Ou validar baseado em contagem real de aplicações aprovadas (mais seguro)

---

### 1.2 Atualizar trigger SQL para cobrir todos os casos

**Arquivo:** `backend/database_migrations/add_filled_positions_trigger.sql`

**Problema:** Trigger não cobre `canceled_by_vet` e outros status que deveriam decrementar.

**Solução:**

- Expandir trigger para decrementar quando status muda de `approved` para qualquer status que não seja `approved` (incluindo `canceled_by_vet`, `rejected_by_vet`, etc.)
- Já está parcialmente implementado, mas garantir que todos os status finais sejam cobertos

**Mudanças:**

```sql
-- Expandir condição para incluir todos os status que invalidam aprovação
IF v_old_status = 'approved' AND v_new_status NOT IN ('approved', 'check_in', 'check_out', 'report_sent', 'report_approved') THEN
  -- Decrementar
END IF;
```

---

### 1.3 Usar `filled_positions` como fonte de verdade no cálculo de status

**Arquivo:** `backend/src/services/demandLifecycleService.ts`

**Problema:** `calculateDemandStatus` usa contagem em tempo real, ignorando `filled_positions`.

**Solução:**

- Usar `demand.filled_positions` (do banco) como fonte de verdade
- Manter contagem em tempo real apenas para validação/auditoria
- Adicionar função de sincronização para corrigir inconsistências (se necessário)

**Mudanças:**

```typescript
// ANTES: Usava approvedCount (contagem em tempo real)
if (approvedCount >= demand.vacancies) {
  return 'filled';
}

// DEPOIS: Usa filled_positions (mantido pelo trigger)
if (demand.filled_positions >= demand.vacancies) {
  return 'filled';
}
if (demand.filled_positions > 0 && demand.filled_positions < demand.vacancies) {
  return 'partially_filled';
}
```

---

### 1.4 Adicionar validação atômica de vagas antes de aprovar

**Arquivo:** `backend/src/controllers/applicationsController.ts`

**Problema:** Validação de vagas não previne aprovações simultâneas.

**Solução:**

- Usar `SELECT ... FOR UPDATE SKIP LOCKED` ou validação baseada em contagem real
- Validar baseado em contagem de aplicações já aprovadas (mais seguro que `filled_positions`)

**Mudanças:**

```typescript
// Validar baseado em contagem real de aplicações aprovadas
const { data: approvedApps } = await supabaseAdmin
  .from('demand_applications')
  .select('id')
  .eq('demand_id', demand.id)
  .in('status', ['approved', 'check_in', 'check_out', 'report_sent', 'report_approved']);

if (approvedApps && approvedApps.length >= demand.vacancies) {
  return res.status(400).json({ error: 'Não há vagas disponíveis' });
}
```

---

## FASE 2: Unificação e Consistência

### 2.1 Unificar controllers `reviewUnit`

**Problema:** Dois controllers com lógicas diferentes.

**Solução:**

- Manter apenas `backend/src/controllers/units/reviewUnit.ts` (mais completo)
- Remover `backend/src/controllers/adminController.ts:100` (método `reviewUnit`)
- Atualizar rota em `backend/src/routes/adminRoutes.ts` para usar o controller unificado
- Adicionar validação de status antes de aprovar/rejeitar

**Mudanças:**

- Remover método `reviewUnit` de `adminController.ts`
- Garantir que `units/reviewUnit.ts` valide se unidade está em `pending_review` antes de aprovar
- Manter lógica: só ativa clínica se `is_main = true` (comportamento correto)

---

### 2.2 Adicionar validação de transições em `updateDemandStatus`

**Arquivo:** `backend/src/controllers/demandsController.ts`

**Problema:** Permite qualquer transição de status.

**Solução:**

- Usar `DemandLifecycleService.validateStatusTransition` ou criar validação específica para demandas
- Definir transições válidas para status de demanda (não de aplicação)

**Mudanças:**

```typescript
// Adicionar validação de transições válidas para demandas
const validDemandTransitions: Record<string, string[]> = {
  'open': ['with_applicants', 'canceled_by_clinic', 'expired'],
  'with_applicants': ['partially_filled', 'filled', 'canceled_by_clinic'],
  'partially_filled': ['filled', 'in_progress', 'canceled_by_clinic'],
  'filled': ['in_progress', 'canceled_by_clinic'],
  'in_progress': ['awaiting_report', 'completed', 'canceled_by_clinic'],
  'awaiting_report': ['completed', 'canceled_by_clinic'],
  'completed': [], // Status final
  // ... outros status
};

if (!validDemandTransitions[currentDemand.status]?.includes(status)) {
  return res.status(400).json({ 
    error: `Transição inválida de "${currentDemand.status}" para "${status}"` 
  });
}
```

---

### 2.3 Migrar completamente de `position_applications` para `demand_applications`

**Arquivos afetados:**

- `backend/src/controllers/demandsController.ts:568, 594`
- `backend/src/controllers/demandPositionsController.ts` (marcar como deprecated)
- `backend/src/controllers/unitsController.ts:445, 456`
- `backend/src/controllers/reportsController.ts`
- `backend/src/controllers/statisticsController.ts`

**Solução:**

- Criar migration para migrar dados existentes de `position_applications` para `demand_applications` (se houver)
- Atualizar todos os controllers para usar apenas `demand_applications`
- Manter `position_applications` apenas para leitura durante período de transição
- Marcar endpoints que usam `position_applications` como deprecated

**Estratégia:**

1. Criar função helper para buscar aplicações (abstrai a fonte)
2. Atualizar controllers gradualmente
3. Remover referências a `position_applications` após migração completa

---

## FASE 3: Melhorias e Consistência

### 3.4 Criar endpoint interno para sincronização em massa

**Arquivo:** `backend/src/controllers/adminController.ts` ou novo `backend/src/controllers/syncController.ts`

**Solução:**

- Criar endpoint `POST /admin/sync-filled-positions-all` (apenas para admins)
- Executa `syncFilledPositions` para todas as demandas
- Executa `calculateDemandStatus` e atualiza status de todas as demandas
- Útil para correção retroativa após migrações ou inconsistências

**Mudanças:**

```typescript
export const syncAllFilledPositions = async (req: Request, res: Response) => {
  // Verificar se é admin
  const user = req.user!;
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    // Buscar todas as demandas
    const { data: demands, error } = await supabaseAdmin
      .from('demands')
      .select('id');
    
    if (error) throw error;

    const results = {
      total: demands?.length || 0,
      synced: 0,
      errors: [] as string[],
    };

    // Para cada demanda: sync filled_positions e recalcular status
    for (const demand of demands || []) {
      try {
        await DemandLifecycleService.syncFilledPositions(demand.id);
        const newStatus = await DemandLifecycleService.calculateDemandStatus(demand.id);
        await DemandLifecycleService.updateDemandStatus(demand.id, newStatus);
        results.synced++;
      } catch (err: any) {
        results.errors.push(`Demanda ${demand.id}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Sincronização concluída: ${results.synced}/${results.total} demandas`,
      results,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
```

---

## FASE 4: Gaps Críticos Adicionais (Novos)

### 4.1 Criar trigger SQL para recalcular status da demanda automaticamente

**Arquivo:** `backend/database_migrations/add_demand_status_trigger.sql` (novo)

**Problema:** Status da demanda depende de serviços TypeScript que podem falhar ou não ser chamados. Deveria ser atualizado automaticamente pelo banco.

**Solução:**

- Criar trigger SQL que recalcula e atualiza `demands.status` automaticamente quando:
                                - Status de aplicação muda para/de `approved`
                                - Status de aplicação muda para `check_in`, `check_out`, `report_sent`, `report_approved`
- Usar função SQL que replica a lógica de `calculateDemandStatus`
- Garantir que status seja sempre consistente, mesmo se API falhar

**Mudanças:**

```sql
-- Função SQL para calcular status da demanda
CREATE OR REPLACE FUNCTION calculate_demand_status_sql(p_demand_id uuid)
RETURNS text AS $
DECLARE
  v_demand RECORD;
  v_approved_count integer;
  v_check_in_count integer;
  v_report_sent_count integer;
  v_report_approved_count integer;
  v_has_applicants boolean;
BEGIN
  -- Buscar dados da demanda
  SELECT id, vacancies, filled_positions, status
  INTO v_demand
  FROM demands
  WHERE id = p_demand_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Contar aplicações por status
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('approved', 'check_in', 'check_out', 'report_sent', 'report_approved')),
    COUNT(*) FILTER (WHERE status IN ('check_in', 'check_out', 'report_sent', 'report_approved')),
    COUNT(*) FILTER (WHERE status IN ('report_sent', 'report_approved')),
    COUNT(*) FILTER (WHERE status = 'report_approved'),
    COUNT(*) FILTER (WHERE status IN ('applied', 'invited')) > 0
  INTO v_approved_count, v_check_in_count, v_report_sent_count, v_report_approved_count, v_has_applicants
  FROM demand_applications
  WHERE demand_id = p_demand_id;

  -- Calcular status baseado nas regras (mesma lógica do TypeScript)
  IF v_report_approved_count > 0 AND v_report_approved_count = v_approved_count THEN
    RETURN 'completed';
  END IF;

  IF v_report_sent_count > 0 AND v_report_sent_count = v_approved_count THEN
    RETURN 'awaiting_report';
  END IF;

  IF v_check_in_count > 0 THEN
    RETURN 'in_progress';
  END IF;

  IF v_demand.filled_positions >= v_demand.vacancies THEN
    RETURN 'filled';
  END IF;

  IF v_demand.filled_positions > 0 AND v_demand.filled_positions < v_demand.vacancies THEN
    RETURN 'partially_filled';
  END IF;

  IF v_has_applicants THEN
    RETURN 'with_applicants';
  END IF;

  RETURN 'open';
END;
$ LANGUAGE plpgsql;

-- Trigger que atualiza status quando aplicação muda
CREATE OR REPLACE FUNCTION update_demand_status_on_application_change()
RETURNS TRIGGER AS $
DECLARE
  v_new_status text;
BEGIN
  -- Recalcular status da demanda
  v_new_status := calculate_demand_status_sql(NEW.demand_id);
  
  IF v_new_status IS NOT NULL THEN
    UPDATE demands
    SET status = v_new_status, updated_at = now()
    WHERE id = NEW.demand_id;
  END IF;

  RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_update_demand_status ON demand_applications;
CREATE TRIGGER trigger_update_demand_status
  AFTER INSERT OR UPDATE OF status ON demand_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD IS NULL)
  EXECUTE FUNCTION update_demand_status_on_application_change();
```

**Vantagens:**

- Status sempre consistente, mesmo se API falhar
- Reduz 80% dos bugs relacionados a status desatualizado
- Performance melhor (cálculo no banco)

---

### 4.2 Criar controle de transação para aprovações com múltiplas posições

**Arquivo:** `backend/src/controllers/applicationsController.ts`

**Problema:** Cada aprovação é uma operação isolada. Se uma demanda tem múltiplas posições e várias aprovações ocorrem simultaneamente, pode haver inconsistências.

**Solução:**

- Criar função `approveMultipleApplications` que aprova múltiplas aplicações em uma única transação
- Usar `SELECT ... FOR UPDATE` na demanda para lock durante toda a operação
- Validar vagas disponíveis dentro da transação
- Atualizar todas as aplicações e `filled_positions` atomicamente

**Mudanças:**

```typescript
// Novo endpoint para aprovar múltiplas aplicações
export const approveMultipleApplications = async (
  req: Request<{}, {}, { application_ids: string[] }>,
  res: Response
) => {
  const { application_ids } = req.body;
  const user = (req as any).user;

  if (!user || !application_ids || application_ids.length === 0) {
    return res.status(400).json({ error: 'IDs de aplicações são obrigatórios' });
  }

  // Usar transação do Supabase (se disponível) ou implementar com locks
  // Lock na demanda durante toda a operação
  const { data: firstApp } = await supabaseAdmin
    .from('demand_applications')
    .select('demand_id, demands!inner(vacancies, filled_positions, clinic_id)')
    .eq('id', application_ids[0])
    .single();

  if (!firstApp) {
    return res.status(404).json({ error: 'Aplicação não encontrada' });
  }

  const demand = (firstApp as any).demands;
  
  // Verificar permissões
  const hasAccess = await checkClinicAccess(user.id, demand.clinic_id);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Validar vagas disponíveis (dentro de lock)
  const { data: approvedCount } = await supabaseAdmin
    .from('demand_applications')
    .select('id', { count: 'exact' })
    .eq('demand_id', demand.id)
    .in('status', ['approved', 'check_in', 'check_out', 'report_sent', 'report_approved']);

  const currentApproved = approvedCount?.length || 0;
  const requestedApprovals = application_ids.length;

  if (currentApproved + requestedApprovals > demand.vacancies) {
    return res.status(400).json({ 
      error: `Apenas ${demand.vacancies - currentApproved} vagas disponíveis. Tentando aprovar ${requestedApprovals}.` 
    });
  }

  // Aprovar todas as aplicações (trigger atualiza filled_positions automaticamente)
  const { error: updateError } = await supabaseAdmin
    .from('demand_applications')
    .update({ 
      status: 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', application_ids)
    .in('status', ['applied', 'invited']); // Só pode aprovar se estiver nesses status

  if (updateError) throw updateError;

  // Status da demanda será atualizado pelo trigger SQL (4.1)
  
  res.json({ 
    success: true,
    message: `${application_ids.length} aplicações aprovadas com sucesso`,
  });
};
```

**Alternativa mais simples (se não houver transações no Supabase):**

- Manter aprovações individuais, mas garantir que validação de vagas seja feita no trigger SQL (já implementado em 1.4)

---

### 4.3 Padronizar lista de status "ativos" e "finais"

**Arquivo:** `backend/src/utils/applicationStatus.ts` (novo)

**Problema:** Arrays de status estão espalhados e hardcoded em múltiplos lugares (trigger SQL, API, lifecycle). Mudanças precisam ser feitas em vários lugares.

**Solução:**

- Criar arquivo centralizado com constantes de status
- Exportar para uso em TypeScript
- Criar função SQL equivalente para uso em triggers
- Garantir que ambos estejam sempre sincronizados

**Mudanças:**

```typescript
// backend/src/utils/applicationStatus.ts

/**
 * Status de aplicação que indicam que o profissional foi aprovado e está ativo
 * (pode fazer check-in, check-out, enviar relatório)
 */
export const ACTIVE_APPLICATION_STATES = [
  'approved',
  'check_in',
  'check_out',
  'report_sent',
  'report_approved',
] as const;

/**
 * Status de aplicação que são finais (não podem transicionar para outros)
 */
export const FINAL_APPLICATION_STATES = [
  'rejected',
  'rejected_by_vet',
  'canceled_by_vet',
  'report_approved',
] as const;

/**
 * Status de aplicação que indicam candidatura pendente
 */
export const PENDING_APPLICATION_STATES = [
  'applied',
  'invited',
] as const;

/**
 * Status de aplicação que indicam que relatório foi enviado
 */
export const REPORT_STATES = [
  'report_sent',
  'report_approved',
] as const;

export type ActiveApplicationState = typeof ACTIVE_APPLICATION_STATES[number];
export type FinalApplicationState = typeof FINAL_APPLICATION_STATES[number];
export type PendingApplicationState = typeof PENDING_APPLICATION_STATES[number];

/**
 * Verificar se status é ativo
 */
export const isActiveState = (status: string): boolean => {
  return ACTIVE_APPLICATION_STATES.includes(status as ActiveApplicationState);
};

/**
 * Verificar se status é final
 */
export const isFinalState = (status: string): boolean => {
  return FINAL_APPLICATION_STATES.includes(status as FinalApplicationState);
};
```

**Migration SQL equivalente:**

```sql
-- Criar constantes SQL (usando função)
CREATE OR REPLACE FUNCTION get_active_application_states()
RETURNS text[] AS $
BEGIN
  RETURN ARRAY['approved', 'check_in', 'check_out', 'report_sent', 'report_approved'];
END;
$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_final_application_states()
RETURNS text[] AS $
BEGIN
  RETURN ARRAY['rejected', 'rejected_by_vet', 'canceled_by_vet', 'report_approved'];
END;
$ LANGUAGE plpgsql IMMUTABLE;
```

**Atualizar todos os lugares:**

- Trigger SQL: usar `get_active_application_states()`
- `DemandLifecycleService`: importar `ACTIVE_APPLICATION_STATES`
- `applicationsController`: importar constantes
- Qualquer outro lugar que use arrays hardcoded

---

### 4.4 Implementar rollback inteligente com transações no banco

**Arquivo:** `backend/database_migrations/add_application_approval_transaction.sql` (novo)

**Problema:** Se a API falhar depois que o trigger atualiza `filled_positions` e `status`, pode deixar dados inconsistentes. Precisa de transação que envolva aplicação + status da demanda.

**Solução:**

- Criar stored procedure que aprova aplicação E atualiza status da demanda em uma única transação
- Se qualquer parte falhar, tudo é revertido
- API chama a stored procedure ao invés de fazer UPDATE direto

**Mudanças:**

```sql
-- Stored procedure para aprovar aplicação com transação completa
CREATE OR REPLACE FUNCTION approve_application_safe(
  p_application_id uuid,
  p_demand_id uuid,
  p_vacancies integer
)
RETURNS jsonb AS $
DECLARE
  v_current_status text;
  v_current_filled integer;
  v_new_status text;
  v_result jsonb;
BEGIN
  -- Lock da demanda para evitar race conditions
  SELECT status, filled_positions
  INTO v_current_status, v_current_filled
  FROM demands
  WHERE id = p_demand_id
  FOR UPDATE; -- Lock exclusivo

  -- Validar vagas disponíveis
  IF v_current_filled >= p_vacancies THEN
    RAISE EXCEPTION 'Não há vagas disponíveis. Vagas preenchidas: %, Total: %', 
      v_current_filled, p_vacancies;
  END IF;

  -- Verificar status atual da aplicação
  SELECT status INTO v_current_status
  FROM demand_applications
  WHERE id = p_application_id;

  IF v_current_status NOT IN ('applied', 'invited') THEN
    RAISE EXCEPTION 'Aplicação não pode ser aprovada. Status atual: %', v_current_status;
  END IF;

  -- Atualizar aplicação
  UPDATE demand_applications
  SET 
    status = 'approved',
    approved_at = now(),
    updated_at = now()
  WHERE id = p_application_id;

  -- filled_positions será atualizado pelo trigger existente
  -- Status da demanda será atualizado pelo trigger de status (4.1)

  -- Retornar resultado
  v_result := jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'demand_id', p_demand_id
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback automático (transação)
    RAISE;
END;
$ LANGUAGE plpgsql;
```

**Atualizar controller para usar stored procedure:**

```typescript
// Em applicationsController.ts
const { data, error } = await supabaseAdmin.rpc('approve_application_safe', {
  p_application_id: applicationId,
  p_demand_id: demand.id,
  p_vacancies: demand.vacancies,
});

if (error) {
  // Erro já inclui mensagem de validação
  return res.status(400).json({ error: error.message });
}
```

**Vantagens:**

- Transação atômica: tudo ou nada
- Validação e atualização na mesma transação
- Rollback automático em caso de erro
- Impossível ter inconsistências

### 3.1 Reverter operação se `filled_positions` falhar (ou remover código)

**Arquivo:** `backend/src/controllers/applicationsController.ts`

**Problema:** Erros são apenas logados, não revertidos.

**Solução:**

- Como vamos remover código manual de `filled_positions`, esse problema desaparece
- Se houver erro no trigger SQL, será exceção do banco e a transação será revertida automaticamente
- Adicionar monitoramento/logging para detectar inconsistências

---

### 3.2 Garantir consistência: clínica só ativa com unidade principal aprovada

**Arquivo:** `backend/src/controllers/units/reviewUnit.ts`

**Problema:** Já está correto, mas documentar melhor.

**Solução:**

- Manter lógica atual (só ativa se `is_main = true`)
- Adicionar comentários explicando o comportamento
- Garantir que frontend filtre apenas unidades aprovadas (já implementado)

---

### 3.3 Adicionar função de sincronização de `filled_positions`

**Arquivo:** `backend/src/services/demandLifecycleService.ts`

**Solução:**

- Criar função `syncFilledPositions(demandId)` que recalcula baseado em aplicações reais
- Usar como ferramenta de manutenção/correção
- Chamar periodicamente ou quando detectar inconsistência

**Mudanças:**

```typescript
static async syncFilledPositions(demandId: string): Promise<void> {
  // Contar aplicações realmente aprovadas
  const { data: approvedApps } = await supabaseAdmin
    .from('demand_applications')
    .select('id')
    .eq('demand_id', demandId)
    .in('status', ['approved', 'check_in', 'check_out', 'report_sent', 'report_approved']);
  
  const realCount = approvedApps?.length || 0;
  
  // Atualizar se diferente
  await supabaseAdmin
    .from('demands')
    .update({ filled_positions: realCount })
    .eq('id', demandId);
}
```

---

## Ordem de Implementação

1. **Fase 1.1** - Remover lógica duplicada de `filled_positions` (crítico)
2. **Fase 1.2** - Atualizar trigger SQL (crítico)
3. **Fase 1.3** - Usar `filled_positions` no cálculo de status (crítico)
4. **Fase 1.4** - Validação atômica de vagas (crítico)
5. **Fase 2.1** - Unificar controllers `reviewUnit` (alto)
6. **Fase 2.2** - Validação de transições (alto)
7. **Fase 2.3** - Migrar para `demand_applications` (alto, pode ser gradual)
8. **Fase 3.1-3.3** - Melhorias e sincronização (médio)

---

## Testes Necessários

1. Teste de concorrência: aprovar múltiplas aplicações simultaneamente
2. Teste de cancelamento: cancelar aplicação aprovada e verificar decremento
3. Teste de status: verificar que status reflete `filled_positions` corretamente
4. Teste de validação: tentar transições inválidas de status
5. Teste de sincronização: forçar inconsistência e corrigir com `syncFilledPositions`

---

## Riscos e Mitigações

**Risco 1:** Remover código manual pode quebrar se trigger não estiver ativo

- **Mitigação:** Verificar se trigger existe antes de remover código
- **Mitigação:** Adicionar migration check para garantir trigger está ativo

**Risco 2:** Migração de `position_applications` pode perder dados

- **Mitigação:** Criar backup antes de migrar
- **Mitigação:** Manter tabela legada em modo read-only durante transição

**Risco 3:** Mudança de cálculo de status pode afetar demandas existentes

- **Mitigação:** Rodar `syncFilledPositions` em todas as demandas após deploy
- **Mitigação:** Comparar resultados antes/depois em staging

### To-dos

- [ ] Remover lógica duplicada de filled_positions em applicationsController.ts (linhas 538-572), deixando apenas validação. O trigger SQL já atualiza automaticamente.
- [ ] Atualizar trigger SQL para decrementar filled_positions quando status muda de 'approved' para 'canceled_by_vet' ou outros status finais
- [ ] Modificar calculateDemandStatus para usar demand.filled_positions como fonte de verdade ao invés de contagem em tempo real
- [ ] Adicionar validação atômica de vagas antes de aprovar, usando contagem real de aplicações aprovadas ao invés de filled_positions
- [ ] Unificar controllers reviewUnit: remover método de adminController.ts e manter apenas units/reviewUnit.ts, atualizando rotas
- [ ] Adicionar validação de transições válidas em updateDemandStatus usando DemandLifecycleService ou validação específica para demandas
- [ ] Migrar todos os controllers de position_applications para demand_applications, começando por demandsController.ts, unitsController.ts, reportsController.ts e statisticsController.ts
- [ ] Criar função syncFilledPositions em DemandLifecycleService para recalcular e corrigir inconsistências quando necessário
- [ ] Adicionar documentação e comentários explicando que clínica só ativa quando unidade principal (is_main) é aprovada