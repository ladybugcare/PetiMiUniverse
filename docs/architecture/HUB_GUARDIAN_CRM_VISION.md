# PetMi Hub — visão CRM tutores + família do pet

Este documento guarda o **backlog temático** de produto (tutores como CRM + pet como centro emocional + família estendida), **ligado por fases** ao modelo de domínio e aos épicos. Não substitui [HUB_DOMAIN_MODEL.md](./HUB_DOMAIN_MODEL.md) nem [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md); complementa-os com nuance que não cabe no MVP da fundação.

**Leitura obrigatória em paralelo**: seção *Guardian como CRM operacional* em [HUB_DOMAIN_MODEL.md](./HUB_DOMAIN_MODEL.md#guardian-como-crm-operacional-evolução-por-fases).

---

## Princípio de produto

- O **pet** é o centro emocional para o tutor.
- O **guardian (tutor)** é o centro **operacional e financeiro** na relação clínica–cliente.
- A ligação tutor ↔ pet é **N:N**: um tutor tem vários pets; um pet tem vários tutores/cuidadores com papéis diferentes.
- O que depende do **par** (ex.: “financeiro da Lua” vs “só emergência da Kyra”) pertence à **tabela de junção** (`pet_guardians`), não só ao registo do guardian.

---

## Fase 1 — Fundação (Epics 1–2 + operação mínima)

| Tema | Backlog (resumo) | Notas |
|------|-------------------|--------|
| Guardian | Nome, contato, docs opcionais, preferências de canal leves, consentimento onde aplicável | Ver Epic 1; evitar formulário gigante no primeiro release |
| `pet_guardians` | `primary` / `secondary` + opcional `is_billing_contact`, `receives_notifications` | Ver Epic 2 |
| Pet | Identidade + org + `petmi_pet_id` | Epic 2 |
| O que não fazer aqui | CRM completo, campanhas, cartão salvo, perfil comportamental completo | Ver fronteiras em [PRODUCT_BOUNDARIES.md](./PRODUCT_BOUNDARIES.md) |

---

## Fase 2 — Tutor completo + relação rica

### Guardian (dados e contato)

| Item | Detalhe |
|------|---------|
| Identidade | Nome social, CPF/RG conforme política LGPD, data nascimento, género opcional, foto |
| Contato | Celular, WhatsApp (pode ser o mesmo número com flag), email, telefone secundário; tabela de telefones se necessário |
| Endereço | CEP, rua, número, complemento, bairro, cidade, estado, coordenadas opcionais (distância, região de atendimento) |
| Preferências operação | Canal preferido, aceita notificações operacionais, aceita campanhas (opt-in), horários preferidos |
| Financeiro leve | Método de pagamento favorito, preferência PIX; **inadimplência / limite** só com regras claras e RGPD |
| Perfil para staff | Tags e **notas internas**; evitar “classificação subjetiva” como dado oficial sem governação (quem vê, retenção, direito de resposta) |

### Junção `pet_guardians` (PetTutorRelationship)

| Item | Detalhe |
|------|---------|
| Tipo de relacionamento | Ex.: principal, co-tutor, responsável financeiro, emergência, cuidador, passeador (lista fechada versionada) |
| Permissões / flags | Recebe notificações, pode aprovar procedimentos, pode buscar o pet, contato de emergência, mora junto, etc. |
| Institucional | ONG, lar, hotel como “guardian” exige **tipo de entidade** (PF / PJ / instituição) — não misturar no MVP sem modelo |

---

## Fase 3 — Pet rico + timeline

### Pet — identidade e saúde (camadas)

| Área | Conteúdo | Onde vive |
|------|-----------|-----------|
| Identidade | Nome, foto, espécie, raça, sexo, castrado, cor, peso, data nascimento | `pets` + extensões |
| Saúde | Vacinas, alergias, doenças, medicamentos, exames, cirurgias | Resumo no pet; **detalhe clínico** e responsabilidade legal no módulo **Clinic** + consentimentos ([PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md)) |
| Comportamento | Sociável, medos, agressividade, hotel/creche, petiscos, foge, etc. | JSON validado ou `pet_behavior_profile`; alto valor para banho/hotel/vet |

### Timeline

- Feed tipo “Instagram privado + prontuário”: vacina, banho, foto, consulta, comportamento, medicação, hotel, relatório diário — **tipos de evento** a crescer com Epic 6 (`pet_timeline_events`) e módulos.

---

## Fase 4 — CRM tutor + família do pet + ecossistema

### Tutor profile (CRM)

| Área | Conteúdo |
|------|-----------|
| Overview | Pets vinculados, próximos agendamentos, últimos encounters |
| Financeiro | Agregados quando `hub_payments` / faturação simples forem maduros; **cartão salvo / tokenização** → platform |
| Operação | Notas internas, mensagens operacionais (fornecedor, opt-in), campanhas (opt-in explícito) |

### “Família do pet” (diferencial)

- Relacionados ao pet: tutores, co-tutores, **parceiros** (hotel favorito, vet de referência) como entidades ligadas ou integração **PetMi ID** — não bloquear Fase 1; evoluir quando identidade portátil e consentimentos estiverem claros.

### O que fica fora do Hub “core” ou é tardio

| Tema | Motivo |
|------|--------|
| Billing pesado, cashback, wallet | [PRODUCT_BOUNDARIES.md](./PRODUCT_BOUNDARIES.md) — platform / gateway |
| Mensagens e campanhas em massa | Fornecedor, templates, dedupe — camada platform; opt-in LGPD |
| Prontuário legal completo | Módulo Clinic + consentimento; não duplicar antes da governança |

---

## Riscos e governança

1. **LGPD**: CPF, saúde, comportamento, notas sobre pessoa exigem base legal, minimização e políticas de retenção.
2. **Notas “tutor difícil”**: tratar como dado interno sensível; permissões `hub.guardians.internal_notes.*` (futuro) e auditoria.
3. **Ordem de entrega**: manter [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md) (agenda → encounter → timeline → pagamentos) antes de investir pesado em UI “Airbnb + Health” sem dados a fluir.

---

## Referências cruzadas

- Modelo de domínio: [HUB_DOMAIN_MODEL.md](./HUB_DOMAIN_MODEL.md)
- Épicos Fase 1: [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md)
- Permissões: [PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md)
- Fronteiras produto: [PRODUCT_BOUNDARIES.md](./PRODUCT_BOUNDARIES.md)
