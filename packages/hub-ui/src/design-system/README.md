# Hub Design System (catálogo)

Pré-visualização de componentes do pacote `@petimi/hub-ui`, sem Storybook.

## Ver no browser

1. Importe o showcase numa rota (ex. em `apps/hub-web`):

```tsx
import { HubDesignSystemShowcase } from '@petimi/hub-ui';

<Route path="design-system" element={<HubDesignSystemShowcase />} />
```

2. Abra `http://localhost:3002/hub/design-system` (porta do hub-web).

## Componentes documentados

| Componente | Código | DESIGN.md |
|------------|--------|-----------|
| **HubDateField** | `src/components/HubDateField.tsx` | `components.date-field` |
| HubSearchableCombobox | `src/components/HubSearchableCombobox.tsx` | (ver seção Components) |
| HubBrDateInput | `src/components/HubBrDateInput.tsx` | legado — preferir HubDateField |

## Tokens

Arquivo canônico: [`../DESIGN.md`](../DESIGN.md) — validar com `npm run design:lint`.
