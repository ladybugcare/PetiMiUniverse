# PetMi Hub — Plano de testes automatizados (Financeiro e Atendimento)

Plano para **introduzir testes automatizados** no backend do Hub, priorizando os fluxos de maior risco para o MVP: **Financeiro/Caixa** e **Atendimento (encounters)**. Hoje não há cobertura efetiva — o script `test` em `backend/package.json` é um placeholder e os arquivos em `backend/src/__tests__/` apenas verificam `expect(true).toBe(true)`.

> **Escopo (jun/2026):** este plano cobre a infraestrutura de testes + a primeira leva de testes nos fluxos financeiro e de atendimento. Demais módulos (agenda, grooming, orçamentos) entram em ondas seguintes reusando a mesma base.

---

## 1. Estado atual

| Item | Situação |
|------|----------|
| Runner de testes | **Não configurado** (Jest ausente; `test` = `echo`) |
| Arquivos existentes | `auth.test.ts`, `validation.test.ts` — apenas esqueleto |
| Mock do Supabase | Não existe |
| CI | Não roda testes |
| Validação Zod nos controllers | Presente (bom alvo para testes unitários puros) |

**Risco:** o módulo financeiro manipula dinheiro (recebíveis, pagamentos, caixa, estornos) e o de atendimento controla transições de estado clínico. Regressões aqui são caras e silenciosas.

---

## 2. Stack escolhida

| Camada | Ferramenta | Porquê |
|--------|-----------|--------|
| Runner | **Vitest** | Nativo a ESM/TS (o backend usa `tsx`/ESM), rápido, API compatível com Jest. *(Alternativa: Jest + ts-jest, já citado no README de testes — escolher uma e padronizar.)* |
| HTTP | **supertest** | Testar rotas Express montadas sem subir porta |
| Mock Supabase | **Stub manual** do client | Evitar dependência de banco real; injetar duplo do `supabase-js` |
| Cobertura | `vitest --coverage` (c8) | Medir progresso por módulo |

> **Decisão a registrar no PR de setup:** Vitest **ou** Jest. Este plano assume Vitest; se o time preferir Jest, manter o `jest.config.js` já documentado em `backend/src/__tests__/README.md`.

### Dependências a instalar (backend)

```bash
npm install --save-dev vitest supertest @types/supertest @vitest/coverage-v8
```

### Scripts (`backend/package.json`)

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage"
```

---

## 3. Estratégia por camada

### 3.1 Unitários puros (sem banco) — prioridade máxima, baixo custo
Funções determinísticas e schemas Zod. Não precisam de Supabase.

| Alvo | Arquivo | O que testar |
|------|---------|--------------|
| Schemas Zod de pagamento/recebível | `hubFinancialController.ts` | rejeita valor ≤ 0, moeda inválida, campos faltando |
| Cálculo de saldo/somatórios | helpers do financeiro | soma de pagamentos = total; saldo nunca negativo |
| Resolução de preço | `hubPricingResolve.ts` | tier por porte/período retorna valor esperado |
| Máquina de estados de encounter | `hubEncountersController.ts` | transições válidas/ inválidas (`draft`→`in_progress`→`completed`) |
| `hasPermission` | `utils/permissions.ts` | CADMIN sempre true; CASSISTANT sem `financial.write`; etc. |

### 3.2 Integração de rotas (supertest + Supabase mockado) — prioridade alta
Montar o `Router` do Hub com um duplo do client Supabase e middleware de auth stubado.

- Verificar **status HTTP** e **forma da resposta**.
- Verificar que `requirePermission(...)` barra role sem permissão (**403**).
- Verificar **escopo por `clinic_id`/`unit_id`** (o controller filtra pelo contexto do usuário).

### 3.3 E2E contra banco real — **fora do MVP**
Adiável; exige ambiente isolado. Não rodar contra produção.

---

## 4. Casos prioritários — Financeiro/Caixa

> Regra de negócio central: **nenhum recebível é criado automaticamente**; pagamentos exigem caixa/permissão.

| # | Caso | Tipo | Esperado |
|---|------|------|----------|
| F1 | `POST /finance/receivables` sem `hub.receivables.create` | integração | **403** |
| F2 | Gerar cobrança a partir de atendimento sem cobrança | integração | cria `hub_receivables` + linhas; item sai da lista «sem cobrança» |
| F3 | Pagamento parcial e depois o restante | unit + integração | soma dos `hub_payments` = total; saldo zera; nunca negativo |
| F4 | Pagamento que excede o saldo | unit | rejeitado (valor > saldo) |
| F5 | `waive-billing` sem motivo | unit (Zod) | rejeitado (motivo obrigatório) |
| F6 | Estorno de pagamento | integração | cria movimento de reversão; histórico preservado (sem hard delete) |
| F7 | Cancelar recebível pago | integração | bloqueado ou regra documentada respeitada |
| F8 | Receber pagamento sem caixa aberto | integração | conforme regra (403/erro de negócio) |
| F9 | Somatório do dia por unidade | unit | coerente com `hub_payments` da unidade (não vaza de outra unidade/clínica) |
| F10 | Valores monetários em **centavos** (int) | unit | sem erro de ponto flutuante (ex.: 0.1+0.2) |

---

## 5. Casos prioritários — Atendimento (Encounters)

| # | Caso | Tipo | Esperado |
|---|------|------|----------|
| E1 | `POST /encounters` sem `hub.clinic.write` | integração | **403** |
| E2 | Abrir encounter a partir de agendamento (idempotente) | integração | 2ª chamada não cria duplicado |
| E3 | Transição inválida (`draft`→`completed` sem `in_progress`) | unit | rejeitada |
| E4 | Concluir encounter | integração | status `completed`; entra em «Atendimentos sem cobrança» (não cria recebível) |
| E5 | Amend de encounter concluído | integração | gera nova versão; histórico via `getHubEncounterVersions` |
| E6 | Day-board filtra por `unit_id` | integração | não retorna encounter de outra unidade/clínica |
| E7 | Acesso a encounter de outra clínica (ID forjado) | integração | **403/404** |

---

## 6. Padrão de mock do Supabase (esboço)

Criar `backend/src/__tests__/helpers/supabaseMock.ts` com um duplo encadeável (`from().select().eq()...`) que devolve dados controlados, e um helper para injetar usuário autenticado com role/clinic_id no `req`.

```ts
// Esboço — implementar no PR de setup
export function makeSupabaseMock(tables: Record<string, any[]>) {
  // retorna objeto com from(name) => query builder fake (select/insert/update/eq/single)
}
export function authAs(role: string, clinicId: string, unitId?: string) {
  // middleware fake que popula req.user / req.clinicContext
}
```

> O ideal a médio prazo é **injeção de dependência** do client Supabase nos controllers (hoje provavelmente importado direto), para permitir substituir nos testes sem `vi.mock` frágil. Registrar como refactor habilitador.

---

## 7. Fases de entrega

| Fase | Conteúdo | Pronto quando |
|------|----------|---------------|
| **0 — Setup** | Vitest + supertest + scripts + 1 teste real verde (substituir `expect(true)`) | `npm test` roda e falha/passa de verdade |
| **1 — Unitários financeiro+encounter** | Casos F3–F5, F10, E3 + `hasPermission` | Cobertura dos cálculos e schemas críticos |
| **2 — Integração permissões** | F1, E1 + matriz `requirePermission` por rota | Rotas sensíveis cobertas por 403 |
| **3 — Integração fluxo** | F2, F6, E2, E4, E5, E6, E7 | Caminho feliz + isolamento multi-tenant |
| **4 — CI** | Rodar `npm test` no pipeline; bloquear merge se vermelho | Testes obrigatórios no PR |

---

## 8. Critérios de pronto (MVP)

- [ ] `npm test` executa Vitest de verdade (sem placeholders `expect(true)`).
- [ ] Todos os casos **F1–F10** e **E1–E7** implementados e verdes.
- [ ] Mock de Supabase reutilizável documentado.
- [ ] CI roda os testes e bloqueia merge em caso de falha.
- [ ] Cobertura mínima acordada para `hubFinancialController` e `hubEncountersController` (sugestão inicial: linhas ≥ 60%).

---

## 9. Referências de código

| Área | Arquivo |
|------|---------|
| Controllers financeiro | `backend/src/modules/hub/hubFinancialController.ts`, `hubComandasController.ts` |
| Controller atendimento | `backend/src/modules/hub/hubEncountersController.ts` |
| Rotas + `requirePermission` | `backend/src/modules/hub/routes/index.ts` |
| Permissões | `backend/src/utils/permissions.ts` |
| Esqueleto atual de testes | `backend/src/__tests__/` + `backend/src/__tests__/README.md` |

*Última atualização: jun/2026.*
