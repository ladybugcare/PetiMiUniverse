# Roadmap de permissões — produto e módulo

Este documento define a **evolução do RBAC** de roles amplas (`CADMIN`, `CMANAGER`, …) para **permissões granulares namespaced**, alinhadas às fronteiras em [PRODUCT_BOUNDARIES.md](./PRODUCT_BOUNDARIES.md).

## Estado atual (referência)

- Arquivo: `backend/src/utils/permissions.ts`.
- Padrão: `Role -> string[]` de permissões funcionais (`demand.create`, `unit.edit`, …).
- Roles de clínica: `CADMIN`, `CMANAGER`, `CASSISTANT`, `CVET_INTERNAL`.
- Existem também roles globais de app (`ADMIN`, `VET`, `FREELANCER`) em auth/rotas, fora deste mapa estático.

**Limitação**: mistura permissões de **vet-match** e **marketplace** com futuras permissões de **hub** sem namespace; difícil evoluir para entitlements por módulo.

---

## Convenção de nomes

Formato:

```text
<produto>.<recurso>.<ação>
```

Onde `<produto>` ∈ `platform`, `hub`, `clinic`, `grooming`, `boarding`, `vet_match`, `marketplace`, `admin`, `petmi_id`.

`<ação>` ∈ `read`, `create`, `update`, `delete`, `approve`, `sign`, `export`, `manage` (wildcard interno por role).

Exemplos:

- `hub.appointments.read`
- `hub.encounters.checkout`
- `vet_match.demands.publish`

---

## Catálogo sugerido — Hub (core operacional)

| Permissão | Descrição |
|-----------|-----------|
| `hub.units.read` | Ver unidades permitidas |
| `hub.units.manage` | CRUD unidades (pode ficar só CADMIN) |
| `hub.staff.invite` | Convidar staff |
| `hub.staff.manage` | Editar/remover membros |
| `hub.guardians.read` | Listar tutores |
| `hub.guardians.write` | Criar/editar tutores |
| `hub.pets.read` | Ver pets |
| `hub.pets.write` | Criar/editar pets |
| `hub.appointments.read` | Ver agenda |
| `hub.appointments.write` | Criar/editar/cancelar compromissos |
| `hub.prospects.read` | Ver arquivo de contatos (orçamentos) |
| `hub.prospects.write` | Criar/editar contatos |
| `hub.quotes.read` | Ver orçamentos |
| `hub.quotes.write` | Criar/editar/enviar/converter orçamentos |
| `hub.encounters.read` | Ver atendimentos em andamento/histórico |
| `hub.encounters.checkin` | Check-in |
| `hub.encounters.perform` | Registrar execução (notas, status) |
| `hub.encounters.checkout` | Check-out e conclusão |
| `hub.timeline.read` | Ver linha do tempo do pet |
| `hub.payments.read` | Ver cobranças |
| `hub.payments.write` | Registrar pagamento / emitir recibo simples |
| `hub.dashboard.read` | Dashboard operacional da unidade |

---

## Catálogo sugerido — Clinic (módulo Hub)

| Permissão | Descrição |
|-----------|-----------|
| `clinic.record.read` | Ler prontuário |
| `clinic.record.write` | Escrever evolução, anexos não sensíveis |
| `clinic.record.sign` | Assinatura profissional (vet) |
| `clinic.prescriptions.manage` | Prescrições |
| `clinic.vaccines.manage` | Cartão de vacina |
| `clinic.exams.manage` | Pedidos/resultados de exames |

Dados clínicos devem exigir **consentimento** registrado (ver `petmi_id` + políticas futuras).

---

## Catálogo sugerido — Grooming / Boarding (módulos Hub)

| Permissão | Descrição |
|-----------|-----------|
| `grooming.queue.manage` | Fila de banho, status |
| `grooming.media.upload` | Fotos durante atendimento |
| `boarding.reservations.manage` | Reservas hotel/daycare |
| `boarding.daily_report.write` | Relatório diário |

---

## Catálogo sugerido — Vet/Match (staffing)

Mapear permissões atuais para namespace:

| Atual (exemplo) | Novo |
|-----------------|------|
| `demand.create` | `vet_match.demands.create` |
| `demand.edit` | `vet_match.demands.update` |
| `demand.view` | `vet_match.demands.read` |
| `application.approve` | `vet_match.applications.approve` |
| `application.reject` | `vet_match.applications.reject` |
| `application.create.internal` | `vet_match.applications.create_internal` |

Work proof e convites:

| Permissão | Descrição |
|-----------|-----------|
| `vet_match.work_proof.submit` | Enviar prova de plantão |
| `vet_match.work_proof.review` | Revisar/aprovar prova |
| `vet_match.invites.manage` | Convites proativos |

---

## Catálogo sugerido — Marketplace

| Atual | Novo |
|-------|------|
| `marketplace.create` | `marketplace.listings.create` |
| `marketplace.edit` | `marketplace.listings.update` |
| `marketplace.delete` | `marketplace.listings.delete` |
| `marketplace.view` | `marketplace.listings.read` |

Mensagens:

| Permissão | Descrição |
|-----------|-----------|
| `marketplace.messages.read` | Ler thread do listing |
| `marketplace.messages.write` | Enviar mensagem |

---

## Catálogo sugerido — Admin plataforma

| Permissão | Descrição |
|-----------|-----------|
| `admin.organizations.approve` | Aprovar org/clínica |
| `admin.users.impersonate` | Impersonação (se existir) |
| `admin.support.manage` | Tickets globais |
| `admin.reports.system` | Relatórios globais |

---

## Catálogo sugerido — PetMi ID

| Permissão | Descrição |
|-----------|-----------|
| `petmi_id.pet.profile.read` | Ver perfil canônico do pet |
| `petmi_id.pet.profile.write` | Atualizar dados com consentimento |
| `petmi_id.sharing.manage` | Gerir compartilhamento entre orgs |

---

## Matriz de migração — roles de clínica → permissões Hub + legado

Proposta **inicial** (ajustável por produto):

| Role | Hub core | Clinic | Grooming/Boarding | Vet-match | Marketplace |
|------|----------|--------|-------------------|-----------|-------------|
| `CADMIN` | conjunto amplo read/write + payments | configurável | configurável | manter atual | manter atual |
| `CMANAGER` | read/write unidade, sem delete org | subset | subset | manter atual | create/edit listing |
| `CASSISTANT` | appointments/encounters leitura + check-in limitado | opcional read | opcional queue | demand view | read |
| `CVET_INTERNAL` | encounters perform + pets read | record read/write conforme política | opcional | view + internal application | opcional |

> **Nota**: `CVET_INTERNAL` foi adicionado a `AppRole` em `packages/web-core/src/types.ts` (anteriormente existia apenas em `ClinicStaffRole`). O role é reconhecido em `getUserRole` e `getDashboardPathForRole`. Grooming/Boarding staff usam `CASSISTANT` com permissões namespaced (`grooming.*`, `boarding.*`) até existirem módulos dedicados.

Implementação: tabela `role_permission_defaults` ou constante versionada em código até surgir UI custom por clínica.

---

## Entitlements (módulos contratados)

Independente de role, a organização pode não ter módulo ativo:

- `module.hub_core`
- `module.clinic`
- `module.grooming`
- `module.boarding`
- `module.vet_match`
- `module.marketplace`
- `module.crm`
- `module.bi`

**Regra**: `hasPermission(user, perm)` **e** `organizationHasModule(org, module)`.

---

## Plano de implementação técnica (incremental)

1. **Introduzir namespaces** nas strings de permissão mantendo aliases temporários (`demand.create` → delega para `vet_match.demands.create`).
2. **Atualizar** `PERMISSIONS` em `permissions.ts` para listas com novos nomes; manter função `hasPermission` compatível.
3. **Middleware** `requirePermission('hub.appointments.read')` nos novos endpoints Hub.
4. **Frontend**: espelho em `usePermissions` / helpers; chaves alinhadas ao backend.
5. **Persistir overrides** (fase 2): `clinic_role_permissions` no banco para CMANAGER custom.

---

## Critérios de pronto (definição para “migração fase 1”)

- [ ] Todas as permissões novas de Hub listadas neste doc existem no backend.
- [ ] Nenhuma rota nova de Hub depende apenas de “estar logado na clínica”.
- [ ] Vet-match e marketplace continuam funcionando com mapa de aliases.
- [ ] Documentação de API (Swagger) referencia namespaces onde possível.
