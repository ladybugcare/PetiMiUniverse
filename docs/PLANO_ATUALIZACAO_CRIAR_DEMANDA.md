# Plano de Atualização - Tela "Criar Demanda"

## 1. OBJETIVO DA ATUALIZAÇÃO

**Mudança de Conceito:**
- ❌ **ANTES:** "Buscar profissional" (busca imediata)
- ✅ **DEPOIS:** "Abrir demanda / Publicar vaga" (receber candidaturas)

**Justificativa:**
Alinhar a interface com o lifecycle de demandas implementado, onde clínicas publicam vagas e recebem candidaturas de profissionais, podendo também convidar vets específicos.

---

## 2. ARQUIVOS QUE SERÃO MODIFICADOS

### 2.1 Componentes Principais

| Arquivo | Tipo | Alterações Necessárias |
|---------|------|------------------------|
| `frontend/src/components/CategorySelectionStep.tsx` | Componente | **CRÍTICO** - Substituir todos os textos dos cards e títulos |
| `frontend/src/components/DemandFormStep.tsx` | Componente | Revisar títulos e subtítulos do header colorido |
| `frontend/src/pages/CreateDemandPage.tsx` | Página | Validar `pageName` (já está correto: "Criar Demanda") |

### 2.2 Arquivos de Referência (Verificar Consistência)

| Arquivo | Tipo | Verificação Necessária |
|---------|------|------------------------|
| `frontend/src/services/sidebarMenuService.tsx` | Service | ✅ Já usa "Criar Demanda" - OK |
| `frontend/src/pages/ClinicDashboardPage.tsx` | Página | ✅ Já usa "Criar Demanda" - OK |
| `frontend/src/App.tsx` | Rotas | ✅ Rota `/create-demand` - OK |
| `frontend/src/components/DemandPositionsForm.tsx` | Componente | Verificar textos relacionados a "profissional" |

---

## 3. MAPEAMENTO DE TEXTOS A SEREM SUBSTITUÍDOS

### 3.1 CategorySelectionStep.tsx

#### **TEXTO ATUAL → TEXTO NOVO**

**Header:**
- ❌ Título: `"Que tipo de profissional você precisa?"`
- ✅ **NOVO:** `"Que tipo de demanda você deseja abrir?"`

- ❌ Subtítulo: `"Escolha a categoria que melhor se adequa à sua necessidade"`
- ✅ **NOVO:** `"Selecione a categoria para criar uma demanda e receber candidaturas de profissionais qualificados."`

**Card 1 - Veterinário:**
- ❌ Título: `"Buscar Veterinário"`
- ✅ **NOVO:** `"Criar Demanda para Veterinário"`

- ❌ Descrição: `"Encontre profissionais especializados para consultas, cirurgias e emergências"`
- ✅ **NOVO:** `"Publique uma vaga para consultas, cirurgias ou atendimentos emergenciais e receba candidaturas."`

**Card 2 - Freelancer:**
- ❌ Título: `"Buscar Freelancer"`
- ✅ **NOVO:** `"Criar Demanda para Freelancer"`

- ❌ Descrição: `"Grooming, adestramento, passeios e cuidados especializados"`
- ✅ **NOVO:** `"Abra uma demanda para grooming, adestramento, passeios ou cuidados especializados."`

**Card 3 - Clínica Parceira:**
- ❌ Título: `"Buscar Clínica Parceira"`
- ✅ **NOVO:** `"Criar Demanda para Clínica Parceira"`

- ❌ Descrição: `"Parcerias com outras clínicas para serviços especializados"`
- ✅ **NOVO:** `"Solicite suporte de outras clínicas para serviços especializados."`

**Card 4 - Outros:**
- ❌ Título: `"Outros Profissionais"`
- ✅ **NOVO:** `"Criar Demanda para Outros Profissionais"`

- ❌ Descrição: `"Consultorias, pesquisa e outros serviços especializados"`
- ✅ **NOVO:** `"Crie demandas para consultorias e serviços técnicos especializados."`

### 3.2 DemandFormStep.tsx

#### **TEXTO ATUAL → TEXTO NOVO**

**Header por Categoria:**

**Veterinário:**
- ❌ Título: `"Nova Demanda para Veterinário"`
- ✅ **NOVO:** `"Criar Demanda para Veterinário"` (ou manter, mas revisar subtítulo)

- ❌ Subtítulo: `"Descreva a vaga ou serviço veterinário necessário"`
- ✅ **NOVO:** `"Preencha os detalhes da vaga para receber candidaturas de veterinários qualificados."`

**Freelancer:**
- ❌ Título: `"Nova Demanda para Freelancer"`
- ✅ **NOVO:** `"Criar Demanda para Freelancer"`

- ❌ Subtítulo: `"Descreva o serviço de cuidado pet necessário"`
- ✅ **NOVO:** `"Preencha os detalhes da vaga para receber candidaturas de freelancers qualificados."`

**Clínica Parceira:**
- ❌ Título: `"Nova Demanda para Clínica Parceira"`
- ✅ **NOVO:** `"Criar Demanda para Clínica Parceira"`

- ❌ Subtítulo: `"Descreva a parceria ou serviço clínico necessário"`
- ✅ **NOVO:** `"Preencha os detalhes da demanda para receber propostas de clínicas parceiras."`

**Outros:**
- ❌ Título: `"Nova Demanda Profissional"`
- ✅ **NOVO:** `"Criar Demanda para Outros Profissionais"`

- ❌ Subtítulo: `"Descreva o serviço profissional necessário"`
- ✅ **NOVO:** `"Preencha os detalhes da vaga para receber candidaturas de profissionais especializados."`

**Placeholder do Textarea:**
- ❌ Atual: `"Descreva as atividades, requisitos e o que espera do profissional..."`
- ✅ **NOVO:** `"Descreva as atividades, requisitos e o que espera do profissional. Esta descrição será visível para os candidatos."`

**Botão de Submit:**
- ✅ Atual: `"Criar Demanda →"` - **MANTER** (já está correto)

### 3.3 DemandPositionsForm.tsx

**Verificar:**
- Texto: `"Profissional {index + 1}"` - Considerar mudar para `"Vaga {index + 1}"` ou `"Posição {index + 1}"`
- Texto: `"Selecione todas as especialidades necessárias para este profissional"` - Considerar `"Selecione todas as especialidades necessárias para esta vaga"`

---

## 4. INCONSISTÊNCIAS ENCONTRADAS

### 4.1 Textos que Sugerem "Buscar Profissional"

✅ **Já Corrigidos (não precisam mudança):**
- Rotas: `/create-demand` - ✅ Correto
- `pageName` em `CreateDemandPage.tsx`: "Criar Demanda" - ✅ Correto
- Menu lateral: "Criar Demanda" - ✅ Correto
- Botões FAB: "Criar Demanda" - ✅ Correto

❌ **Precisam Correção:**
1. **CategorySelectionStep.tsx:**
   - Título principal: "Que tipo de profissional você precisa?" → Sugere busca imediata
   - Todos os títulos dos cards começam com "Buscar" → Sugere busca imediata
   - Descrições focam em "encontrar" → Sugere busca imediata

2. **DemandFormStep.tsx:**
   - Subtítulos focam em "descrever serviço necessário" → Pode ser interpretado como busca
   - Placeholder do textarea menciona "o que espera do profissional" → OK, mas pode melhorar

### 4.2 Semântica de Funções e Variáveis

✅ **Já Corretos:**
- `handleCategorySelect` - ✅ OK (seleciona categoria)
- `onSelect` - ✅ OK (callback genérico)
- `createCompositeDemand` - ✅ OK (cria demanda)

❌ **Revisar:**
- Nenhuma função ou variável encontrada com semântica incorreta

### 4.3 Fluxo de Navegação

✅ **Verificado:**
- Clicar no card → Leva para `DemandFormStep` (formulário de criação) - ✅ Correto
- Não leva para listagem de profissionais - ✅ Correto
- Após criar → Navega para `/clinic-dashboard` - ✅ Correto

---

## 5. REVISÃO DE COMPONENTES

### 5.1 CategorySelectionStep.tsx

**Estrutura Atual:**
```
- Container
  - Header (título + subtítulo)
  - Grid de Cards (4 cards)
    - Card (button)
      - Icon Circle
      - Título
      - Descrição
      - Arrow (→)
```

**Ajustes Necessários:**
1. ✅ Layout já está correto (2 colunas / 4 colunas responsivo)
2. ✅ Ícones podem ser mantidos (mesmo estilo)
3. ✅ Cores podem ser mantidas
4. ❌ **TEXTO:** Substituir todos os textos conforme seção 3.1

**Hierarquia Visual:**
- ✅ Título: `fontSize: '36px'`, `fontWeight: '700'` - OK
- ✅ Subtítulo: `fontSize: '18px'` - OK
- ✅ Espaçamento: `marginBottom: '48px'` - OK

**Comportamento CTA:**
- ✅ Cards são `button` - OK (comportamento correto)
- ✅ Hover effects - OK
- ✅ `onClick` leva para formulário - OK

### 5.2 DemandFormStep.tsx

**Estrutura Atual:**
```
- Container
  - Header Colorido (gradient)
    - Título
    - Subtítulo
  - Form Card
    - Form
      - Campos de input
      - Botões (Voltar / Criar Demanda)
```

**Ajustes Necessários:**
1. ✅ Layout já está correto
2. ❌ **TEXTO:** Atualizar títulos e subtítulos do header conforme seção 3.2
3. ❌ **TEXTO:** Melhorar placeholder do textarea

**Hierarquia Visual:**
- ✅ Header com gradient - OK (visual atrativo)
- ✅ Título: `fontSize: '32px'`, `fontWeight: '700'` - OK
- ✅ Subtítulo: `fontSize: '16px'` - OK

### 5.3 CreateDemandPage.tsx

**Estrutura Atual:**
```
- DashboardLayout
  - pageName="Criar Demanda" ✅
  - Conditional Render:
    - CategorySelectionStep (step === 'category')
    - DemandFormStep (step === 'form')
```

**Ajustes Necessários:**
- ✅ `pageName` já está correto
- ✅ Fluxo de steps já está correto
- ✅ Nenhuma alteração necessária

---

## 6. ACESSIBILIDADE E MICROCOPY

### 6.1 Acessibilidade

**Textos Alternativos (aria-label):**
- ✅ Cards são `button` - OK (acessível)
- ❌ **ADICIONAR:** `aria-label` nos cards para screen readers:
  - `"Criar demanda de veterinário"`
  - `"Criar demanda de freelancer"`
  - `"Criar demanda de clínica parceira"`
  - `"Criar demanda de outros profissionais"`

**Hierarquia Semântica:**
- ✅ `<h1>` no título principal - OK
- ✅ `<h3>` nos títulos dos cards - OK
- ✅ `<p>` nas descrições - OK

**Navegação por Teclado:**
- ✅ Cards são `button` - OK (focáveis)
- ✅ Tab order natural - OK

### 6.2 Microcopy

**Mensagens de Sucesso/Erro:**
- ✅ `"Demanda criada com sucesso!"` - OK
- ✅ `"Erro ao criar demanda: ..."` - OK

**Placeholders:**
- ❌ Melhorar placeholder do textarea (ver seção 3.2)

**Hints/Helper Text:**
- ✅ `"Selecione qual unidade abrirá esta demanda"` - OK
- ✅ `"Demanda noturna"` com hint explicativo - OK

---

## 7. CONSISTÊNCIA COM LIFECYCLE

### 7.1 Alinhamento com Funcionalidades Implementadas

✅ **Convites:**
- Após criar demanda, clínica pode convidar vets específicos
- Texto deve deixar claro que a demanda receberá candidaturas (não busca imediata)

✅ **Candidaturas:**
- Profissionais se candidatam às demandas
- Texto deve enfatizar "receber candidaturas"

✅ **Status do Lifecycle:**
- Demanda começa como `'open'` → `'with_applicants'` → `'filled'` → etc.
- Texto deve refletir que é um processo (não busca imediata)

### 7.2 Fluxo Completo

```
1. Clínica acessa /create-demand
2. Seleciona categoria (ex: "Criar Demanda para Veterinário")
3. Preenche formulário
4. Cria demanda (status: 'open')
5. Demanda aparece para vets (podem se candidatar)
6. Clínica pode convidar vets específicos
7. Recebe candidaturas
8. Aprova/rejeita candidaturas
9. Lifecycle continua...
```

**Validação:**
- ✅ Textos propostos estão alinhados com este fluxo
- ✅ Não sugerem busca imediata
- ✅ Enfatizam "criar demanda" e "receber candidaturas"

---

## 8. DESIGN SYSTEM PETIVET

### 8.1 Tipografia

**Verificação:**
- ✅ Título principal: Poppins, 36px, 700 - OK
- ✅ Subtítulo: Inter, 18px - OK
- ✅ Títulos dos cards: Poppins, 22px, 600 - OK
- ✅ Descrições: Inter, 15px - OK

**Consistência:**
- ✅ Mesmas fontes usadas em outras páginas
- ✅ Tamanhos seguem hierarquia visual

### 8.2 Espaçamento

**Verificação:**
- ✅ Container padding: `48px 32px` - OK
- ✅ Header margin-bottom: `48px` - OK
- ✅ Grid gap: `24px` - OK
- ✅ Card padding: `32px` - OK

**Consistência:**
- ✅ Espaçamentos seguem padrão do Design System

### 8.3 Cores

**Verificação:**
- ✅ Cards usam cores do Design System:
  - Veterinário: `#7c3aed` (primary)
  - Freelancer: `#f59e0b` (warning)
  - Clínica: `#0ea5e9` (info)
  - Outros: `#22c55e` (success)

**Consistência:**
- ✅ Cores alinhadas com paleta PetiVet

### 8.4 Bordas e Sombras

**Verificação:**
- ✅ Card border-radius: `20px` - OK
- ✅ Card border: `2px solid #e5e5e5` - OK
- ✅ Hover shadow: `0 12px 24px ${color}30` - OK

**Consistência:**
- ✅ Estilo alinhado com outros cards do sistema

---

## 9. PROPOSTAS DE MICROAJUSTES NO LAYOUT

### 9.1 Melhorias Sugeridas (Opcionais)

1. **Adicionar Ícone de "Publicar" nos Cards:**
   - Considerar adicionar ícone de "Upload" ou "Send" junto com a seta (→)
   - Reforça o conceito de "publicar vaga"

2. **Badge "Nova" no Header:**
   - Considerar adicionar badge discreto "Nova Demanda" no header
   - Opcional, pode ser removido se poluir a interface

3. **Tooltip nos Cards:**
   - Adicionar tooltip explicativo ao hover: "Clique para criar uma demanda e receber candidaturas"
   - Melhora a UX e reforça o conceito

4. **Ícone de "Candidaturas" no Card:**
   - Considerar adicionar ícone pequeno de "Users" ou "Clipboard" nos cards
   - Visualmente reforça que receberá candidaturas

### 9.2 Ajustes de Responsividade

✅ **Já Implementado:**
- Grid responsivo (4 colunas → 2 colunas → 1 coluna)
- Layout se adapta bem a diferentes tamanhos de tela

**Sem alterações necessárias.**

---

## 10. RECOMENDAÇÕES PARA MANTER CONSISTÊNCIA

### 10.1 Em Outras Telas

**Verificar e Atualizar (se necessário):**
1. **DemandsPage.tsx:**
   - Verificar se há textos que sugerem "buscar profissional"
   - Garantir que botões dizem "Criar Demanda" (não "Buscar")

2. **ClinicApplicationsPage.tsx:**
   - Verificar textos relacionados a candidaturas
   - Garantir consistência com novo conceito

3. **Documentação:**
   - Atualizar qualquer documentação que mencione "buscar profissional"

### 10.2 Em Mensagens do Sistema

**Verificar:**
- Notificações de nova demanda criada
- Emails de confirmação
- Mensagens de sucesso/erro

**Recomendação:**
- Usar sempre "demanda criada" (não "busca iniciada")
- Enfatizar "receberá candidaturas"

### 10.3 Em Helpers e Tooltips

**Adicionar (se não existir):**
- Tooltip no botão "Criar Demanda" do menu: "Abra uma nova demanda para receber candidaturas"
- Helper text no formulário: "Após criar, você receberá candidaturas e poderá convidar profissionais específicos"

---

## 11. CHECKLIST DE IMPLEMENTAÇÃO

### 11.1 Textos

- [ ] Atualizar título principal em `CategorySelectionStep.tsx`
- [ ] Atualizar subtítulo principal em `CategorySelectionStep.tsx`
- [ ] Atualizar título do Card 1 (Veterinário)
- [ ] Atualizar descrição do Card 1 (Veterinário)
- [ ] Atualizar título do Card 2 (Freelancer)
- [ ] Atualizar descrição do Card 2 (Freelancer)
- [ ] Atualizar título do Card 3 (Clínica Parceira)
- [ ] Atualizar descrição do Card 3 (Clínica Parceira)
- [ ] Atualizar título do Card 4 (Outros)
- [ ] Atualizar descrição do Card 4 (Outros)
- [ ] Atualizar títulos do header em `DemandFormStep.tsx` (4 categorias)
- [ ] Atualizar subtítulos do header em `DemandFormStep.tsx` (4 categorias)
- [ ] Atualizar placeholder do textarea em `DemandFormStep.tsx`

### 11.2 Acessibilidade

- [ ] Adicionar `aria-label` nos cards de categoria
- [ ] Verificar navegação por teclado
- [ ] Testar com screen reader

### 11.3 Validação

- [ ] Verificar que não há mais textos com "buscar profissional"
- [ ] Verificar que fluxo leva para criação (não busca)
- [ ] Testar criação de demanda completa
- [ ] Validar mensagens de sucesso/erro

### 11.4 Consistência

- [ ] Revisar outras páginas mencionadas
- [ ] Verificar mensagens do sistema
- [ ] Validar com Design System

---

## 12. RESUMO EXECUTIVO

### Arquivos a Modificar: 2
1. `frontend/src/components/CategorySelectionStep.tsx` - **CRÍTICO**
2. `frontend/src/components/DemandFormStep.tsx` - **IMPORTANTE**

### Textos a Substituir: 18
- 1 título principal
- 1 subtítulo principal
- 4 títulos de cards
- 4 descrições de cards
- 4 títulos de header (formulário)
- 4 subtítulos de header (formulário)
- 1 placeholder de textarea

### Inconsistências Encontradas: 3
1. Título principal sugere "buscar profissional"
2. Títulos dos cards começam com "Buscar"
3. Descrições focam em "encontrar" (busca imediata)

### Ajustes de Acessibilidade: 1
- Adicionar `aria-label` nos cards

### Microajustes Opcionais: 4
- Ícone de "Publicar" nos cards
- Badge "Nova" no header
- Tooltip explicativo
- Ícone de "Candidaturas"

---

## 13. PRÓXIMOS PASSOS

1. ✅ Plano criado e documentado
2. ⏳ Aguardando aprovação do plano
3. ⏳ Implementar mudanças de texto
4. ⏳ Adicionar melhorias de acessibilidade
5. ⏳ Testar fluxo completo
6. ⏳ Validar consistência com outras páginas

---

**Documento criado em:** 2025-01-18  
**Versão:** 1.0  
**Status:** Aguardando aprovação para implementação

