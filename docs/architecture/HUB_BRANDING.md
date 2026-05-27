# PetMi Hub — identidade visual (logo e paleta)

O **PetMi Hub** é um produto distinto do **PetMi Vet** (staffing/matching). Na implementação do frontend do Hub, a UI deve seguir **outro logo** e **outra paleta** — não usar o sistema de cores de marca do Vet (`colors.brand` em [frontend/src/styles/colors.ts](frontend/src/styles/colors.ts)) como identidade principal das telas Hub.

## Objetivo

- Marca e ambiente visual coerentes com o posicionamento do Hub (SO do negócio pet).
- Convivência no mesmo monorepo e, muitas vezes, no mesmo usuário (staff da clínica), sem confundir produtos.

## Onde registar a paleta e o logo

1. **Documentação**: tabelas abaixo (valores oficiais).
2. **DESIGN.md (agentes / ferramentas):** [packages/hub-ui/DESIGN.md](../../packages/hub-ui/DESIGN.md) — tokens YAML + racional no formato [`@google/design.md`](https://www.npmjs.com/package/@google/design.md) (lint: `cd packages/hub-ui && npx @google/design.md lint DESIGN.md`). Catálogo de componentes: [packages/hub-ui/src/design-system/README.md](../../packages/hub-ui/src/design-system/README.md) (rota Hub: `/hub/design-system`).
3. **Código (tokens TypeScript):** [packages/hub-ui/src/theme/hubTheme.ts](../../packages/hub-ui/src/theme/hubTheme.ts) — importar `hubTheme` do pacote `hub-ui` nas telas Hub (`apps/hub-web`, `packages/hub-ui`).
4. **Assets**:
   - Logo Hub: `apps/hub-web/public/` (ex.: `petmi-hub-logo.png`) ou, no app universal, `frontend/public/hub/` / `frontend/assets/hub/` (ex.: `logo.svg`).
   - Favicon opcional para rotas Hub se no futuro houver subdomínio ou PWA separada.

## Implementação recomendada (quando for desenvolver o front Hub)

1. **Shell Hub**: um layout em `frontend/src/products/hub/components/HubLayout.tsx` (nome ilustrativo) que:
   - renderiza o logo Hub;
   - aplica tokens Hub (`hubTheme` ou CSS variables derivadas);
   - não importa cabeçalhos específicos do dashboard Vet.
2. **Evitar**: `colors.brand` do arquivo global nas páginas sob `/hub/...` exceto para componentes **realmente** partilhados e neutros (avaliar caso a caso).
3. **Preferir**: `hubTheme.brand.primary[500]`, `hubTheme.surface.page`, etc.

## Paleta principal (oficial)

| Hex | Papel sugerido |
|-----|----------------|
| `#c86a4d` | **Primária** — CTAs, links fortes, marca |
| `#e7c4af` | **Primária clara** — realces, seções suaves |
| `#a88ab8` | **Acento lilás** — destaques secundários, dados, gráficos |
| `#89c2af` | **Acento menta** — bem-estar, estados leves, alternativa à primária |
| `#ede7e2` | **Superfície** — cartões, separadores suaves |
| `#faf7f4` | **Fundo de página** — base quente claríssima |

## Cores de apoio

| Hex | Papel sugerido |
|-----|----------------|
| `#4a3b3a` | **Texto principal** — alto contraste sobre fundos claros |
| `#8e6e67` | **Texto secundário** — legendas, meta |
| `#6fa677` | **Sucesso / confirmação** — feedback positivo (verde apoio) |
| `#d6d6d6` | **Bordas / divisores** — neutro frio (único token; repetido na spec de design como mesma cor) |

## Tokens Hub (mapa para código)

| Token | Valor | Uso |
|-------|-------|-----|
| `hub.brand.primary.500` | `#c86a4d` | Botão primário, link ativo |
| `hub.brand.primary.200` | `#e7c4af` | Hover suave, backgrounds de destaque |
| `hub.brand.primary.50` | `#faf7f4` | Fundo global Hub |
| `hub.accent.lavender` | `#a88ab8` | Acento UI |
| `hub.accent.mint` | `#89c2af` | Acento alternativo |
| `hub.surface.card` | `#ede7e2` | Cards |
| `hub.surface.page` | `#faf7f4` | Page background |
| `hub.text.primary` | `#4a3b3a` | Corpo de texto |
| `hub.text.secondary` | `#8e6e67` | Texto auxiliar |
| `hub.border.default` | `#d6d6d6` | Bordas |
| `hub.semantic.success` | `#6fa677` | Sucesso |

Escala `primary.100`–`800` em [hubTheme.ts](../../packages/hub-ui/src/theme/hubTheme.ts) completa tons para hover e texto sobre primária (validar contraste em UI real).

## Critérios de aceite (branding)

- [ ] Primeira página Hub MVP (ex.: tutores ou dashboard Hub) usa **apenas** tokens Hub + logo Hub no topo.
- [ ] Não há texto de marca “PetMi Vet” no shell Hub (exceto créditos legais globais do site, se aplicável).
- [ ] Contraste WCAG AA nos pares texto/fundo principais (validar com ferramenta ao fechar tokens).

## Referências

- Modularização de pastas: [FRONTEND_MODULARIZATION.md](./FRONTEND_MODULARIZATION.md)
- Épicos: [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md)
