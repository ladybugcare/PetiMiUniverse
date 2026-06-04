# PetMi Hub — Orçamentos e contatos (prospects) sem “falso cliente”

**Estado:** em implementação incremental no monorepo (API `/api/hub/prospects`, `/api/hub/quotes`). Este documento mantém o desenho de produto e regista **decisões fechadas** para o MVP técnico.

## Decisões de implementação (MVP)

| Tópico | Decisão |
|--------|---------|
| Tabelas | `hub_prospects`, `hub_quotes`, `hub_quote_pets`, `hub_quote_lines` |
| Rotas API | `GET/POST /api/hub/prospects`, `GET/PATCH/DELETE /api/hub/prospects/:id`; `GET/POST /api/hub/quotes`, `GET/PATCH/DELETE /api/hub/quotes/:id`, `POST .../send`, `POST .../cancel`, `POST .../convert` |
| Validade (`expires_at`) | **7 dias após envio**: ao passar o orçamento a `sent`, define-se `sent_at` e `expires_at = sent_at + 7 dias`. Rascunhos (`draft`) não expiram por tempo até serem enviados. |
| CPF / `tax_id` | No Hub, **todo prospect tem CPF**. Matching **prospect ↔ tutor** e badge «Já é cliente» usam **CPF normalizado** na mesma clínica. **Em implementação (Fase 2b):** um prospect **ativo** por `(clinic_id, CPF normalizado)` — ver secção *Prospect único por CPF (opção B)*. Na conversão, a API devolve **409** se já existir tutor ativo com o mesmo CPF sem `link_to_guardian_id`; com `link_to_guardian_id`, associa ao existente. |
| Porte no orçamento | Alinhado a `hub_pets.size_tier`: `mini`, `pequeno`, `medio`, `grande`, `gigante`. |
| Permissões | `hub.prospects.read` / `hub.prospects.write`, `hub.quotes.read` / `hub.quotes.write` (incluídas nas mesmas roles que tutores/serviços, ver `permissions.ts`). |
| PJ / notificações / PDF | Fora do MVP de código inicial; Fase 5: máscara de CPF em listagens na UI; PDF e WhatsApp permanecem backlog explícito. |

### Estados (`hub_quotes.status`)

`draft` → `sent` (envio) → `accepted` | `expired` | `cancelled`. `expired` é aplicado pela API ao listar quando `status = sent` e `expires_at < now()`.

### Faturação após aceite (alinhado ao [HUB_FINANCIAL_MODEL.md](./HUB_FINANCIAL_MODEL.md))

| Regra | Decisão |
|--------|---------|
| Recebível ao aceitar | **Não.** `status = accepted` significa apenas que o cliente aceitou a proposta. |
| Fluxo | `accepted` → coluna `billing_state = awaiting_billing` → CTA **Gerar cobrança** na UI → criação de `hub_receivables` + linhas → `hub_payments`. |
| `billing_state` | `none` \| `awaiting_billing` \| `receivable_created` (persistido em `hub_quotes` após migração). |
| Waive | `billing_waived_at` + `billing_waive_reason` removem o orçamento da lista «sem cobrança» sem criar recebível. |
| UI comanda | Preferir o termo **«Abrir comanda»** no fluxo de faturação a partir de orçamento aceite (alinhado ao checkout/comanda no Hub). |

## Prospect único por CPF (opção B) — decisão de produto

- O **prospect** representa uma **pessoa / contacto comercial**, não uma «oportunidade» descartável por orçamento.
- **Regra:** reutilizar um prospect por `clinic_id` + **CPF normalizado**; **não** criar novo prospect quando já existir prospect **ativo** (`deleted_at` nulo) com o mesmo CPF na clínica. **Vários** `hub_quotes` podem apontar para o mesmo `prospect_id`.
- Se existir **tutor** (`hub_guardians`) ativo com o mesmo CPF: na listagem de contatos, expor `matching_guardian_id` (ou equivalente) para badge **«Já é cliente»** e ação **«Abrir ficha do cliente»**. O orçamento **mantém** `prospect_id` neste ciclo (sem criar orçamento só com `guardian_id` — isso fica como **evolução futura**, opção D).
- **Não** remover o prospect da lista automaticamente quando existir tutor.
- **Após** associar orçamento a tutor existente (`convert` com `link_to_guardian_id`): sugerir **arquivar** o prospect como ação **secundária** (opcional).

### Concorrência (antes / durante Fase 2b)

- Se dois utilizadores tentarem criar prospect com o mesmo CPF em simultâneo, o backend deve **evitar duplicidade**.
- **Preferência técnica:** `UNIQUE` parcial ou expressão em `(clinic_id, tax_id_normalizado)` para prospects **ativos**, **ou** transação com `SELECT … FOR UPDATE` / upsert equivalente.
- Até existir migração, a lista pode ainda mostrar duplicados legados; a Fase 2b deve incluir estratégia de dados (limpeza ou merge manual) se necessário.

### Pets no orçamento e tutor já existente (Fase 2b)

- Coluna **`hub_quote_pets.hub_pet_id`** (já prevista na migração `alter_hub_quote_pets_hub_pet_id.sql`): vínculo **opcional** ao pet operacional da clínica.
- **Fluxo «Novo orçamento»** quando o CPF corresponde a um tutor: carregar pets desse tutor; o utilizador pode **selecionar explicitamente** um ou mais pets existentes e/ou **adicionar** pet novo **só no contexto do orçamento** (sem `hub_pet_id`).
- **Não** fazer matching automático de pet **apenas pelo nome**; o nome pode ser ajuda visual, mas o vínculo confiável vem da **seleção explícita**.
- **Na conversão (`convert`):** para cada `hub_quote_pet` com `hub_pet_id` já preenchido, **não** recriar `hub_pets`; para linhas **sem** `hub_pet_id`, criar pet e vincular ao tutor como hoje.
- **Na comanda / checkout:** itens derivados do orçamento devem levar `hub_pet_id` quando existir, para cobrança por pet, histórico e evitar duplicidade.

## Problema

Nas plataformas atuais é comum **cadastrar a pessoa como cliente** (`hub_guardians` / ficha completa) só para **emitir um orçamento**. Se o negócio não fecha, a clínica fica com **cadastros a apagar** ou ruído no CRM. Queremos um fluxo com **dados mínimos**, **validade clara** e **reutilização** ou **conversão explícita** para tutor + pet.

## Princípio de desenho

- **Orçamento ≠ tutor** até existir conversão explícita: não misturar prospects com a lista de **Clientes** operacionais.
- **Contato mínimo** (nome, CPF, telefone) pode persistir num **arquivo de contatos** para novo orçamento sem redigitar tudo.
- **Expiração**: o orçamento deixa de ser válido após o prazo; os dados da pessoa no arquivo **não** são apagados automaticamente por expirar (política de retenção LGPD a definir com jurídico).

## Dados mínimos — pessoa

| Campo | Obrigatório no MVP desta feature | Notas |
|-------|-----------------------------------|--------|
| Nome | Sim | Texto livre razoável (limite em API). |
| CPF | Sim | Dado sensível; base legal e mascaramento na UI a definir. |
| Telefone | Sim | Canal principal de follow-up. |
| E-mail | Opcional | Útil para envio de PDF/link; pode ser fase 1.1. |

## Dados mínimos — pet(s) no orçamento

Uma linha por animal no orçamento; **N pets** (adicionar mais).

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| Nome do pet | Não | Opcional no primeiro passo. |
| Raça | Sim (ou “SRD” / desconhecido) | Lista fechada vs texto livre — decisão de produto. |
| Porte | Sim | Enum fechado sugerido: `small`, `medium`, `large`, `giant` (alinhar com banho/tosa / pricing se existir catálogo). |

Espécie (cão/gato) pode ser obrigatória se o preço depender disso — documentar na implementação.

## Orçamento (entidade de negócio)

Nome de tabela/API **a definir** na implementação (ex.: `hub_quotes`, `hub_budgets`).

### Conteúdo esperado

- Ligação a `clinic_id` (e opcionalmente `unit_id` quando multi-unidade for requisito de preço).
- Referência ao **contato** / prospect (ver abaixo), não obrigatoriamente a `hub_guardians.id` até conversão.
- Linhas de orçamento (serviços, quantidades, valores) — detalhe comercial pode ser fase incremental (primeiro MVP: valor total + notas).
- **`created_at`**, **`expires_at`**: regra de produto — **7 dias** de validade a partir da criação ou da data de envio (definir gatilho: “criado” vs “enviado ao cliente”).
- Estado sugerido: `draft` | `sent` | `accepted` | `expired` | `cancelled`.
- Após `expires_at`, o sistema trata como **expirado** (não válido para fechar como proposta ativa sem reemitir).

### Contatos / prospects (gaveta)

Entidade separada (ex.: `hub_prospects` / `hub_lead_contacts`) ou agregada ao orçamento com histórico — **recomendação**: tabela de **contato mínimo** reutilizável:

- `clinic_id`, `full_name`, `tax_id` (CPF), `phone`, opcional `email`, `created_at`, `updated_at`, soft delete opcional.
- **Tela dedicado**: listagem + **busca por CPF ou nome** para iniciar **novo orçamento** pré-preenchido.
- **Unicidade de CPF por clínica (prospects ativos):** **opção B** — um contacto ativo por CPF normalizado (implementação Fase 2b + migração); ver secção *Prospect único por CPF*.

## Fluxo — conversão (ganho)

Quando o orçamento é **aceite** / negócio fechado:

1. Ação **“Completar cadastro”** (wizard): materializar **`hub_guardians`** (tutor) + **`hub_pets`** + **`hub_pet_guardians`** com dados já conhecidos + campos em falta (endereço, e-mail, microchip, etc., conforme política da clínica).
2. Ligar o orçamento (e/ou o contato) ao `guardian_id` criado para auditoria e relatórios.
3. Validar **não duplicar CPF** na mesma clínica se já existir tutor ativo (sugestão: oferecer “associar a este tutor” em vez de criar duplicado).

## Fluxo — não fechou

- Orçamento passa a **expirado**; contato permanece na gaveta para **novo orçamento** ou contato comercial futuro.
- Não forçar apagar contato por expiração do orçamento (evita “cadastrou para apagar”); retenção e direito ao apagamento: ver LGPD.

## Empresa (PJ), notificações, permissões

- **PJ no MVP de orçamento**: fora do escopo inicial ou CNPJ mínimo em fase 2 — alinhar com `client_kind` em `hub_guardians` na conversão.
- **Notificações** (“o seu orçamento expira em X dias”): backlog (e-mail/WhatsApp/templates).
- **Permissões** sugeridas: `hub.quotes.read`, `hub.quotes.write`, eventualmente `hub.prospects.read` / `hub.prospects.write` para arquivo de contatos.

## LGPD e segurança

- CPF e telefone são **dados pessoais sensíveis** ou identificativos fortes; documentar finalidade (orçamento, contato comercial), prazo de conservação e direitos do titular.
- Evitar expor CPF completo em listagens (máscara) se política interna o exigir.

## Critérios de aceite (rascunho — implementação futura)

- [ ] Criar orçamento **sem** obrigar linha em `hub_guardians`.
- [ ] Incluir N pets com nome opcional, raça e porte obrigatórios (regra ajustável).
- [ ] `expires_at` calculado; após prazo, API e UI marcam como **expirado** e impedem “aceitar” sem reemitir/renovar.
- [ ] Tela de **contatos** com busca por nome/CPF e ação **Novo orçamento** a partir do contato.
- [ ] Fluxo **Converter em cliente** cria tutor + pet(s) com validação de duplicados e ligação ao orçamento/contato.

## Relação com outros documentos

- Tutores operacionais: [HUB_DOMAIN_MODEL.md](./HUB_DOMAIN_MODEL.md) (seção Guardian).
- CRM e fases: [HUB_GUARDIAN_CRM_VISION.md](./HUB_GUARDIAN_CRM_VISION.md).
- Épicos e backlog geral: [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md).
