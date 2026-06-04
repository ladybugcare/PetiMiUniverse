# Cadastro de pet no PetMi Hub — wizard e mapeamento de campos

## Rotas e UI

- **Lista:** [`/hub/pets`](../../apps/hub-web/src/App.tsx) — [`HubPetsPage`](../../packages/hub-ui/src/pages/HubPetsPage.tsx).
- **Wizard «Novo pet»:** [`/hub/pets/novo`](../../apps/hub-web/src/App.tsx) — [`HubPetWizardPage`](../../packages/hub-ui/src/pages/HubPetWizardPage.tsx) (4 passos + resumo à direita), dentro do [`HubAppShell`](../../apps/hub-web/src/components/HubAppShell.tsx) habitual (sidebar + header).
- **Entrada com tutor pré-selecionado:** `/hub/pets/novo?guardianId=<uuid>` (ex.: a partir de Clientes — «Adicionar pet»).

## Modelo persistido hoje (API + BD)

Tabela `hub_pets` e `POST /api/hub/pets` (ver [`create_hub_pets_and_pet_guardians.sql`](../../backend/database_migrations/petimi_hub/create_hub_pets_and_pet_guardians.sql) e [`hubPetsController.ts`](../../backend/src/modules/hub/hubPetsController.ts)):

| Coluna / payload | Descrição |
|------------------|-----------|
| `name` | Nome do pet (obrigatório) |
| `species` | Espécie (texto, obrigatório) |
| `breed` | Raça (opcional / null) |
| `sex` | `M`, `F`, `U` ou null |
| `birth_date` | Data de nascimento (ISO date) |
| `notes` | Texto livre |
| `primary_guardian_id` | Tutor principal (obrigatório) |
| `secondary_guardian_id` | Tutor secundário (opcional) |
| `petmi_pet_id` | UUID estável gerado pelo sistema (não é microchip físico) |

## Mapeamento wizard (mock) ↔ PetiHub

| Campo no wizard | Persistido agora? | Onde / notas |
|------------------|-------------------|--------------|
| Foto | Não | Pré-visualização local; futuro: Storage + `avatar_url` ou similar. |
| Nome do pet | Sim | `name` |
| Apelido | Não | Futuro: `nickname` ou derivar de `name`. |
| Espécie | Sim | `species` |
| Raça / SRD | Sim | `breed`; se SRD ativo → `breed: null`. |
| Sexo | Sim | `sex` |
| Castrado(a)? | Não | Futuro: `neutered` boolean. |
| Data de nascimento | Sim | `birth_date` |
| Idade | — | Apenas cálculo na UI. |
| Cor / pelagem | Não | Futuro: `coat_color`. |
| Microchip (alfanum.) | Não | **Distinto** de `petmi_pet_id`; futuro: `external_microchip` ou equivalente. |
| Peso / altura / porte | Não | Futuro: `weight_kg`, `height_cm`, `size`. |
| Como nos conheceu? | Não | CRM no pet ou herdar `lead_source` do tutor. |
| Frequenta outros locais? | Não | Futuro: boolean. |
| Observações (passo 1) | Parcial | Concatenadas com notas finais no campo `notes` no submit (blocos separados por linha em branco). |
| Notas finais (passo 4) | Sim | `notes` (merge com observações do passo 1). |
| Passo Saúde | Não | Placeholder até módulo clínico. |
| Documentos (upload) | Não | Placeholder até anexos. |
| Responsáveis | Sim | `primary_guardian_id`, `secondary_guardian_id` |

## Fases recomendadas

1. **Fase 1 (atual):** Wizard completo + persistência só nos campos da API; passos sem backend mostram «Em breve» ou texto explicativo.
2. **Fase 2:** Migração SQL + validação Zod no `hubPetsController` + tipos em [`hubPetsApi.ts`](../../packages/hub-ui/src/api/hubPetsApi.ts) para campos clínicos e CRM (castrado, microchip, porte, foto, etc.).
3. **Fase 3:** Rascunho «Salvar e continuar depois» (tabela `hub_pet_drafts` ou estado em `localStorage` com TTL).

## Permissões

- Escrita: `hub.pets.write`. Sem permissão o usuário é redirecionado para `/hub/pets`.
