---
version: alpha
name: PetMi Hub
description: Identidade visual do produto Hub (distinta do PetMi Vet). Tokens alinhados a hubTheme.ts e HUB_BRANDING.md.
colors:
  primary: "#c86a4d"
  on-primary: "#ffffff"
  primary-container: "#e7c4af"
  primary-hover: "#a85a40"
  primary-soft: "#f5ebe3"
  surface-page: "#faf7f4"
  surface-card: "#ede7e2"
  surface-elevated: "#ffffff"
  text-primary: "#4a3b3a"
  text-secondary: "#8e6e67"
  border-default: "#d6d6d6"
  border-subtle: "#ede7e2"
  accent-lavender: "#a88ab8"
  accent-mint: "#89c2af"
  success: "#6fa677"
  danger: "#ef4444"
  nav-active-bg: "#f0dfd6"
  neutral-900: "#262626"
  neutral-600: "#525252"
typography:
  ui-body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  ui-body-sm:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  ui-label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
  title-page:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title-hero:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.3
rounded:
  sm: 8px
  md: 10px
  lg: 12px
  xl: 14px
  2xl: 18px
  full: 999px
spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
components:
  app-shell-page:
    backgroundColor: "{colors.surface-page}"
  top-header:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.neutral-900}"
    height: 64px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.ui-body}"
    rounded: "{rounded.lg}"
    padding: 14px 20px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 9px 16px
  link-accent:
    textColor: "{colors.primary}"
    typography: "{typography.ui-body-sm}"
  link-secondary-lavender:
    textColor: "{colors.accent-lavender}"
    typography: "{typography.ui-body-sm}"
  sidebar-nav-active:
    backgroundColor: "{colors.nav-active-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  badge-primary-soft:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.full}"
    padding: 6px 14px
  clinic-card-surface:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
  sidebar-caption:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.ui-label}"
  inset-panel:
    backgroundColor: "{colors.border-subtle}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  neutral-divider:
    backgroundColor: "{colors.border-default}"
    height: 1px
  dropdown-danger-item:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.danger}"
    typography: "{typography.ui-body-sm}"
  header-subline:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.neutral-600}"
    typography: "{typography.ui-label}"
  success-dot:
    backgroundColor: "{colors.success}"
    height: 8px
    width: 8px
    rounded: "{rounded.full}"
  card-elevated:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  tag-wellness:
    backgroundColor: "{colors.accent-mint}"
    textColor: "{colors.text-primary}"
    typography: "{typography.ui-body-sm}"
    rounded: "{rounded.md}"
    padding: 6px 10px
  date-field:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
    typography: "{typography.ui-body-sm}"
    rounded: "{rounded.md}"
    padding: 0 12px
  date-field-focus:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
---

## Overview

O **PetMi Hub** é o produto de operação clínica (tutores, pets, agenda, serviços, estoque, orçamentos). A interface deve transmitir **calor, organização e clareza operacional**, com paleta **terrosa e suave** — nunca confundir com o branding **PetMi Vet** (staffing).

- **Fonte de verdade em código:** [`src/theme/hubTheme.ts`](src/theme/hubTheme.ts).
- **Documentação complementar:** [`docs/architecture/HUB_BRANDING.md`](../../docs/architecture/HUB_BRANDING.md) (raiz do repositório).
- **Shell e CSS global do host:** `apps/hub-web/src/index.css` (layout sidebar 272px, header 64px, classes `.hub-*`).
- **Idioma da cópia de produto:** português do Brasil (pt-BR), não português de Portugal.

Agentes devem preferir tokens `hubTheme` / variáveis derivadas em novo código, em vez de hex soltos, para manter consistência com este arquivo.

## Colors

A paleta baseia-se em **terracota** como primária, **fundos quentes** claros e **acentos** lilás e menta para variedade sem competir com a ação principal.

- **`primary` (#c86a4d):** CTAs, links fortes, estados de marca, foco em campos.
- **`on-primary` (#ffffff):** texto e ícones sobre primária sólida.
- **`primary-container` (#e7c4af):** realces suaves, gradientes de login, hover de superfície.
- **`primary-hover` (#a85a40):** hover de botão primário (alinhado a `hubTheme.brand.primary[600]` e usos como `#b55a3f` no CSS — manter contraste AA com texto branco).
- **`primary-soft` (#f5ebe3):** badges e chips discretos ligados à marca.
- **`surface-page` (#faf7f4):** fundo global da aplicação e sidebar.
- **`surface-card` (#ede7e2):** cartões secundários, blocos da sidebar (ex.: cartão da clínica).
- **`surface-elevated` (#ffffff):** header fixo, painéis e modais que “flutuam” sobre o fundo página.
- **`text-primary` (#4a3b3a):** títulos e corpo principal.
- **`text-secondary` (#8e6e67):** legendas, meta, placeholders.
- **`border-default` (#d6d6d6):** bordas de inputs e divisores neutros frios.
- **`border-subtle` (#ede7e2):** separadores quentes discretos.
- **`accent-lavender` (#a88ab8):** destaques secundários, bordas decorativas suaves (ex.: cartão de login).
- **`accent-mint` (#89c2af):** bem-estar, estados leves, etiquetas alternativas à primária.
- **`success` (#6fa677):** confirmações e feedback positivo (mensagens inline costumam usar wash claro + texto verde escuro no CSS — ver contraste).
- **`danger` (#ef4444):** ações destrutivas e alertas críticos (padrão já usado em notificações / dropdown).
- **`nav-active-bg` (#f0dfd6):** item ativo da navegação lateral.
- **`neutral-900` / `neutral-600`:** tons de interface herdados do header e dropdowns (`#262626`, `#525252`) onde o contraste com branco é necessário; preferir gradualmente tokens Hub para texto quando refatorar.

**Nota (WCAG e linter):** a cor primária `#c86a4d` com branco ou sobre fundos muito claros pode ficar **abaixo de 4.5:1** para texto de corpo (o `npx @google/design.md lint` reporta avisos — esperado). Isto espelha a paleta atual em `hubTheme.ts`. Antes de alterar tokens “para passar no lint”, validar com ferramenta de contraste e com stakeholders; ver critérios em HUB_BRANDING.

## Typography

Não há família comercial única: usa-se **stack de sistema** para performance e neutralidade, com hierarquia por **tamanho e peso**.

- **`ui-body`:** texto corrido e botões padrão (16px).
- **`ui-body-sm`:** navegação lateral, linhas de tabela densa, links secundários (14px).
- **`ui-label`:** meta, CNPJ, timestamps (12px, médio).
- **`title-page`:** título da página no header (18px, semibold, tracking ligeiramente negativo).
- **`title-hero`:** títulos de boas-vindas ou vazio (24px / 1.5rem, bold).

Evitar fontes decorativas. Manter `font-family: inherit` em botões dentro de regiões já tipografadas.

## Layout

Estrutura típica do **app shell** no host `hub-web`:

- **Sidebar fixa:** largura **272px**, fundo `surface-page`, borda direita suave (`rgba(74, 59, 58, 0.1)` no CSS atual).
- **Coluna principal:** `margin-left: 272px`, `padding-top: 64px` (reserva para header fixo).
- **Top header:** altura **64px**, largura do restante do viewport, fundo branco, borda inferior discreta.
- **Área de conteúdo (outlet):** padding horizontal **32px** / vertical **24px**–**48px** (valores atuais em `.hub-app-shell__outlet`); conteúdo interno do pacote frequentemente limitado a **~1100px** centrado (`HubChrome`).

Em mobile estreito, o layout pode reduzir largura mínima e empilhar; não assumir apenas desktop, mas o desenho principal é **desktop-first** operacional.

## Elevation & Depth

Profundidade é **contida**: sombras curtas para separar camadas sem estética “neumórfica” pesada.

- **Header:** `0 1px 3px rgba(0, 0, 0, 0.08)`.
- **Dropdowns / menus:** `0 4px 12px` ou `0 10px 25px rgba(0, 0, 0, 0.1)`, raio 8–12px.
- **Cartão de login:** sombra composta com toque de primária `rgba(200, 106, 77, 0.14)` para ancorar na marca.
- **Modais / painéis:** borda `1px solid` com cor de borda + sombra leve; evitar múltiplos níveis de sombra empilhados na mesma vista.

## Shapes

Raios predominam entre **8px e 14px** para controles e cartões; **18px** para cartões hero (login); **999px** para pílulas e badges.

- Cantos muito agudos (0) são exceção (ex.: grades internas); preferir consistência com `rounded` dos tokens.
- Ícones e botões quadrados pequenos (ex.: 40px) usam **8px** ou **10px** de raio.

## Components

Mapeamento orientador (não substitui inspeção de componentes React/CSS):

- **Primário:** fundo `primary`, texto `on-primary`, hover `primary-hover`; raio `lg` em botões grandes.
- **Outline:** contorno `primary`, fundo branco, hover com wash `rgba(200, 106, 77, 0.08)`.
- **Links:** `link-accent` para ações principais; `link-secondary-lavender` para ações secundárias estilo rodapé de login.
- **Navegação:** item ativo com `nav-active-bg`; hover com wash terroso translúcido (`rgba(240, 223, 214, 0.55)` no CSS).
- **Badges:** `badge-primary-soft` para papéis/etiquetas de marca suave.
- **Sucesso:** mensagens inline podem usar fundo translúcido de `success` (ver CSS login) — validar contraste do texto verde escuro sobre o wash.
- **Cartões de perfil / painéis:** `card-elevated` com borda `rgba(74, 59, 58, 0.12)` no padrão atual.
- **Data (`HubDateField`):** rótulo em caixa alta (`ui-label`), controle com borda `border-default`, foco com `primary` + anel `rgba(200, 106, 77, 0.14)`, ícone `Calendar`, chevron que abre **calendário** (grelha mensal, Limpar / Hoje no rodapé) e botão **Hoje** externo. Implementação: [`src/components/HubDateField.tsx`](src/components/HubDateField.tsx). Catálogo: [`src/design-system/README.md`](src/design-system/README.md).

Novos componentes devem **reutilizar** estes padrões antes de introduzir novas cores.

## Do's and Don'ts

**Faça**

- Usar `hubTheme` (ou referências aos tokens deste `DESIGN.md`) para cores de produto Hub.
- Manter **contraste WCAG AA** em texto sobre fundo (validar pares terroso/claro com ferramenta ao alterar tokens).
- Alinhar novas telas ao **app shell** existente (sidebar + header + outlet).
- Escrever **microcopy em pt-BR** (ex.: “usuário”, “salvar”, “e-mail”).

**Não faça**

- Usar a paleta **PetMi Vet** (`colors.brand` do frontend universal) como identidade principal em telas Hub.
- Mostrar “PetMi Vet” no **shell** Hub como marca da área logada (ver critérios em HUB_BRANDING).
- Espalhar **hex literais** quando já existe token equivalente em `hubTheme`.
- Introduzir **acentos fora da paleta** (roxos/azuis genéricos de tailwind) sem atualizar este documento e o tema.

Validação opcional com a ferramenta do ecossistema DESIGN.md:

```bash
cd packages/hub-ui && npm run design:lint
# ou: npx @google/design.md lint DESIGN.md
```
