# QA manual — Agenda Hub: porte, pelagem, filhotes e preço por agendamento

Executar após aplicar as migrações `alter_hub_pets_size_tier.sql`, `alter_hub_appointment_services_pricing_snapshots.sql`, `create_hub_clinic_settings.sql`, `alter_hub_pets_coat_fields.sql`, `alter_hub_appointment_services_coat_pricing_snapshots.sql` (ver [`petimi_hub/README.md`](../../backend/database_migrations/petimi_hub/README.md)) e deploy do backend / `hub-ui`.

## Pré-requisitos

- Staff com `hub.appointments.read` / `hub.appointments.write` e `hub.service_types.read` onde aplicável.
- Pelo menos um tipo de serviço com `service_group` `banho_tosa` e matriz `kind: 'porte'`, `kind: 'pelagem'` ou `kind: 'porte_pelagem'`.
- Pet com `size_tier` preenchido e, para teste de filhote automático, `birth_date` válido.
- Para testes de pelagem automática, pet com `coat_type` preenchido.

## Casos

### 1. Cadastro de pet — porte, cor e pelagem

1. Criar ou editar pet (lista rápida ou wizard) e definir porte (`mini` … `gigante`), cor e pelagem.
2. **Esperado:** API persiste `size_tier`, `coat_color`, `coat_type`; detalhe do pet e tutor mostram os dados necessários para agendamento.

### 2. Configuração — meses máx. filhote

1. Ir a Configurações Hub → serviços (grupos) e descer à seção «Agenda e preços (filhotes)».
2. Alterar o valor (1–24) e guardar.
3. **Esperado:** `GET /api/hub/clinic-settings` devolve o valor; novo agendamento usa esse limite na resolução automática.

### 3. Novo agendamento — automático

1. Abrir «Novo agendamento», selecionar tutor e pet **jovem** (idade em meses completos &lt; limite da clínica) com matriz que inclui `filhote`.
2. Escolher serviço(s) por porte; deixar «Preço por porte» em **Automático**.
3. **Esperado:** Resumo lateral mostra tier `Filhote` nas linhas `porte` aplicável; após gravar, `hub_appointment_services` tem `pricing_porte_tier_applied` e valores de custo/venda coerentes.

### 4. Novo agendamento — override

1. No mesmo fluxo, escolher explicitamente um porte da lista (união dos tiers das matrizes dos serviços).
2. **Esperado:** Resumo e gravação usam esse tier para linhas `porte`; catálogo de serviços **não** é alterado.

### 5. Novo agendamento — pelagem automática

1. Criar serviço Banho & Tosa com `pricing_matrix.kind = 'pelagem'`.
2. Selecionar pet com `coat_type` preenchido; deixar «Preço por pelagem» em **Automático**.
3. **Esperado:** Resumo lateral usa a pelagem do cadastro; `hub_appointment_services.pricing_coat_type_applied` fica preenchido.

### 6. Novo agendamento — porte + pelagem

1. Criar serviço Banho & Tosa com `pricing_matrix.kind = 'porte_pelagem'`.
2. Selecionar pet com porte e pelagem preenchidos.
3. **Esperado:** Resumo usa a combinação correta; snapshots guardam `pricing_porte_tier_applied`, `pricing_coat_type_applied`, custo e venda.

### 7. Pet sem pelagem

1. Selecionar pet sem `coat_type` para serviço por `pelagem` ou `porte_pelagem`.
2. **Esperado:** Modal exige seleção manual de «Preço por pelagem»; API devolve **400** se enviado sem pelagem suficiente.

### 8. Override inválido

1. Escolher um tier que **não** existe na matriz de um dos serviços `porte` selecionados.
2. Repetir com pelagem que não existe na matriz do serviço.
3. **Esperado:** **400** com mensagem clara (API); no modal, validação cliente impede envio quando possível.

### 9. Pet sem data de nascimento

1. Pet sem `birth_date`, matriz com `filhote`, modo automático.
2. **Esperado:** **Nunca** aplica `filhote` só por idade; usa porte corporal ou fallback.

### 10. PATCH de agendamento (API)

1. Criar agendamento com serviços; depois `PATCH /api/hub/appointments/:id` com `pricing_porte_tier`, `pricing_coat_type`, `services`, `pet_id` ou `starts_at` alterados.
2. **Esperado:** Snapshots das linhas recalculados; override continua só naquele agendamento.

## Registo

| Data | Ambiente | Resultado | Notas |
|------|------------|-------------|-------|
|      |            |             |       |
