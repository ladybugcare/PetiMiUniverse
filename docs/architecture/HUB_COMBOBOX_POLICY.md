# Combobox pesquisável (`HubSearchableCombobox`) — política de uso

Componente: [`packages/hub-ui/src/components/HubSearchableCombobox.tsx`](../../packages/hub-ui/src/components/HubSearchableCombobox.tsx).

## Onde `allowCreate={true}` é permitido

| Contexto | Campo | Motivo |
|----------|--------|--------|
| Wizard novo pet | **Espécie** | Clínicas registam espécies exóticas ou nomes locais; texto livre na BD. |
| Wizard novo pet | **Raça** | Listas nunca cobrem todas as raças / nomenclaturas. |
| Cadastro rápido (`PetForm`) | **Espécie** / **Raça** | Mesmo modelo de dados que o wizard. |

O texto criado passa a `value` e é enviado à API tal como está (após `trim` implícito ao selecionar a linha «Adicionar…»).

## Onde `allowCreate={false}` (só lista fechada)

| Contexto | Campo | Motivo |
|----------|--------|--------|
| Toolbar lista pets | **Filtro espécie**, **situação**, **tutor** | Apenas filtra dados existentes + espécies canônicas; não deve inventar filtros que não existem na lista. |
| Paginação lista pets | **Itens por página** | Domínio fixo (10 / 25 / 50). |
| `PetForm` / wizard | **Sexo**, **Porte**, **Como nos conheceu?**, etc. | Domínio enumerado ou CRM fechado. |
| Tutores (`PetWizardStepGuardians`, `PetForm`) | **Tutor principal / secundário** | Entidades da API; não criar tutores fictícios a partir do combobox. |
| Toolbars clientes | **Vínculo**, **Status** | Filtros enumerados. |
| `GuardianCreateForm` | Tipo, documento, sexo, origem, etc. | Integridade de dados e validação backend. |

## Ícones nas opções

`HubComboboxOption.icon` e `triggerIcon` são **opcionais**. Listas enumeradas, filtros e formulários usam em geral só `label` / `value` (sem ícones); o trigger esconde o slot de ícone quando não há nada a mostrar.

## Regra prática

- **Pode criar novo valor:** apenas campos que na BD são **texto livre** (`species`, `breed`) ou que produto aceitar explicitamente no futuro.
- **Não criar:** IDs (tutores, clínicas), enums de negócio, filtros de listagem, datas, permissões.

Ao acrescentar um novo combobox no Hub, indique no PR se `allowCreate` é `true` ou `false` e alinhe com esta tabela.
