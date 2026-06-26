# PetMi Hub — Plano de comunicação com o tutor (WhatsApp sem custo + in-app)

Plano para o **Epic 9 — comunicação com o tutor** do MVP, com a **decisão de produto (jun/2026)**: usar **apenas o que não tem custo**. Nada de API paga de mensageria no MVP.

> **Decisão:** «usaremos somente a parte de services que não cobra nada». Logo, no MVP a comunicação WhatsApp é feita por **link de clique para conversar** (`wa.me` / click-to-chat), que **não tem custo** e **não exige conta de API**. A WhatsApp Business **Cloud API** (com templates aprovados e tarifa por conversa) fica como **fase futura**, claramente separada e desativada por padrão.

---

## 1. O que é gratuito vs. pago

| Abordagem | Custo | Requisitos | Entra no MVP? |
|-----------|-------|------------|---------------|
| **Link `wa.me` / `https://wa.me/<tel>?text=<msg>`** (click-to-chat) | **Zero** | Apenas o telefone do tutor; abre o WhatsApp do **operador** | ✅ Sim |
| **Notificação in-app** (sino `/notifications`) | **Zero** | Infra já existe no Vet (`notificationsController`) | ✅ Sim (interno) |
| WhatsApp Business **Cloud API** (templates, automação) | **Pago** (por conversa) + verificação Meta | Conta Business, número dedicado, templates aprovados | ❌ Fase futura |
| Provedores (Twilio, Z-API, etc.) | **Pago** | Assinatura + número | ❌ Fase futura |

**Conclusão MVP:** click-to-chat (`wa.me`) para falar com o tutor + notificação in-app para a equipe. **Nenhum** envio automático/servidor de mensagens pagas.

---

## 2. Como funciona o click-to-chat (sem custo)

1. O operador clica em «WhatsApp» numa ficha (tutor, pet, drawer de B&T, parada de L&T).
2. O sistema monta `https://wa.me/55<DDD><numero>?text=<mensagem_pré-preenchida_e_encodada>`.
3. Abre o WhatsApp Web/app **do próprio operador**, já com a mensagem pronta para um clique de envio.
4. **Não há** envio em background, nem custo, nem necessidade de aprovação de template pela Meta.

**Limitações aceitas no MVP (documentadas para o usuário):**
- O envio é **manual** (um clique humano), não automático/agendado.
- Usa o número de WhatsApp **do operador/recepção**, não um número oficial da clínica.
- Sem comprovação de entrega/leitura dentro do sistema (só registramos a **tentativa**).

---

## 3. Escopo do MVP

### 3.1 Utilitário de link (frontend)
`packages/hub-ui/src/utils/whatsappLink.ts`:
- `buildWhatsappLink(phoneBR: string, message: string): string | null` — normaliza telefone BR (remove máscara, garante DDI 55), faz `encodeURIComponent` da mensagem; retorna `null` se telefone inválido.
- Reaproveitar validação de telefone existente (ex.: `apps/hub-web/src/utils/brValidators.ts`).

### 3.2 Templates de mensagem (texto, não-Meta)
Constantes em pt-BR, parametrizadas por pet/tutor/clínica. Exemplos:
- `pet_ready` — «Olá {tutor}! O {pet} já está pronto para retirada na {clinica}. 🐾»
- `pet_on_the_way` — «Olá {tutor}! Estamos a caminho para levar o {pet} até você.»
- `appointment_reminder` — «Olá {tutor}! Lembrete do horário do {pet} em {data} às {hora}.»

> São apenas **textos locais** pré-preenchidos no link `wa.me`. **Não** são "templates aprovados" da WhatsApp Business API.

### 3.3 Pontos de uso na UI
| Local | Ação | Template |
|-------|------|----------|
| Ficha do tutor / pet | Botão «WhatsApp» | livre / `appointment_reminder` |
| Drawer Banho & Tosa (`ready`) | «Avisar que está pronto» | `pet_ready` |
| Hotel & Creche (check-out próximo) | «Avisar retirada» | `pet_ready` |
| Leva e Traz (parada `en_route`) | «Avisar que está a caminho» | `pet_on_the_way` |

### 3.4 Log de comunicação (opcional, sem dado sensível)
Tabela leve `hub_message_logs` (registra **tentativa**, não conteúdo sensível):
```sql
hub_message_logs (
  id uuid PK, clinic_id, unit_id,
  guardian_id, pet_id,
  channel text,            -- 'whatsapp_link' | 'in_app'
  template_key text,
  triggered_by_staff_id,
  created_at
)
```
> Como o envio é manual via app do operador, o log marca «link aberto», não «mensagem entregue».

### 3.5 Notificação in-app (interno)
Reaproveitar o sistema do Vet (`notificationsController`, sino em `/notifications`) para avisos internos da equipe (ex.: «pet pronto aguardando retirada»). Já existe `hubNotificationsApi.ts` consumindo `/notifications` no Hub.

---

## 4. Permissões

- Enviar/abrir WhatsApp ao tutor: amarrar a quem já tem acesso à ficha (ex.: `hub.guardians.read` + contexto). Não criar permissão nova só para abrir link.
- Telefone do tutor só visível conforme regras já aplicadas (ex.: equipe de chão de B&T vê telefone para contato, sem preços).

---

## 5. Fora de escopo (fase futura, quando houver verba/decisão)

| Item | Por quê fica fora |
|------|-------------------|
| WhatsApp Business Cloud API | Custo por conversa + verificação Meta + templates aprovados |
| Envio automático/agendado (lembretes em background) | Exige API paga e job server |
| Status de entrega/leitura | Só disponível via API oficial |
| Número oficial da clínica | Exige onboarding Business |

Quando avançar, adicionar um **adapter** `MessageProvider` com implementação `WaMeLinkProvider` (MVP) e `CloudApiProvider` (futuro), selecionável por entitlement/feature flag — sem reescrever os pontos de uso.

---

## 6. Critérios de aceite (MVP)

- [ ] Botão «WhatsApp» abre conversa com a mensagem pré-preenchida correta (pet/tutor/clínica).
- [ ] Telefone inválido/ausente desabilita o botão (sem link quebrado).
- [ ] Nenhuma chamada a API paga; nenhum custo gerado.
- [ ] (Se implementado o log) abrir o link registra tentativa em `hub_message_logs`.
- [ ] Notificação in-app «pet pronto» visível à equipe.
- [ ] Documentado para o usuário que o envio é manual e usa o WhatsApp do operador.

---

## 7. Referências de código

| Área | Arquivo |
|------|---------|
| Notificações (base, Vet) | `backend/src/controllers/notificationsController.ts`, `backend/src/routes/notifications.ts` |
| Consumo de notificações no Hub | `apps/hub-web/src/services/hubNotificationsApi.ts`, `components/HubNotificationBell.tsx` |
| Validação de telefone BR | `apps/hub-web/src/utils/brValidators.ts` |
| Drawer B&T (gatilho «pronto») | `packages/hub-ui/src/pages/grooming/GroomingAppointmentDrawer.tsx` |
| Épico de origem | [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md) — Epic 9 |

*Última atualização: jun/2026.*
