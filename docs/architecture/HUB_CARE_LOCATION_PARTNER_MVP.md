# Hub — Local de atendimento (própria vs clínica parceira) — MVP

## Objetivo

Permitir que a empresa do veterinário registre **onde** o atendimento/exame ocorreu: na **unidade própria** ou em uma **clínica parceira** (catálogo local), mantendo tutores, pets, exames e responsabilidade clínica no tenant do Hub.

## Escopo (IN)

- CRUD de clínicas parceiras em Configurações do Sistema → Clínicas parceiras
  (endereço estruturado: CEP/ViaCEP, UF, cidade, bairro, logradouro, número, complemento — mesmo padrão de tutores)
- Campos `care_location_kind` + `hub_partner_clinic_id` em agendamentos, atendimentos e exames clínicos
- Herança: appointment → encounter → exame (com override no exame)
- Seletor na agenda clínica / walk-in; badge na fila e no workspace
- Filtro de clientes por local (via encounters)
- Exportação CSV de exames
- Agenda: atendimentos em clínica parceira aparecem na grade como horário ocupado do profissional (badge **Parceira**), inclusive com filtro de unidade ativo

## Fora de escopo (OUT)

- Compartilhamento entre dois Hubs / PetMi ID / consentimento
- Parceira como segundo tenant ou unidade real
- Split financeiro, grooming/hotel/L&T com local parceiro
- Novo módulo de assinatura

## Modelo

- Tabela `hub_partner_clinics` (escopo `clinic_id`)
- `care_location_kind`: `own_unit` | `partner_clinic`
- Evolução futura: coluna opcional `linked_clinic_id` quando a parceira também usar a plataforma (PetMi ID)

## Migration

`backend/database_migrations/petimi_hub/093_create_hub_partner_clinics_care_location.sql`  
`backend/database_migrations/petimi_hub/094_alter_hub_partner_clinics_address.sql` (endereço estruturado)

## Critérios de aceite / QA manual

1. Cadastrar parceira em Configurações e usá-la em agendamento clínico → abrir atendimento → solicitar exame (herança do local).
2. Atendimento só em unidade própria continua com default `own_unit`.
3. Filtro de exames / export CSV respeita parceira e `clinic_id` (sem vazamento).
4. Filtro em Clientes “Atendidos em parceira” lista tutores com encounter nessa condição.
5. Não há login nem dados da clínica parceira no Hub dela neste MVP.
6. Agendamento clínico em parceira para profissional X aparece na grade (dia e semana) na coluna de X.
7. Com filtro de unidade ativo, os cards de parceira **continuam visíveis** (profissional ocupado).
8. Card exibe badge **Parceira: {nome}** e visual distinto (borda tracejada); detalhe mostra “Parceira: nome” no lugar da unidade.
9. Tentar agendar o mesmo profissional no mesmo horário na unidade → API retorna conflito de staff.
10. Filtro **Unidade → Clínica parceira** lista só atendimentos externos.

**Checklist agenda:** cadastrar parceira → criar agendamento clínico (rotina ou encaixe) em parceira → abrir Agenda (dia + semana) → aplicar filtro de unidade → confirmar card visível com badge.
