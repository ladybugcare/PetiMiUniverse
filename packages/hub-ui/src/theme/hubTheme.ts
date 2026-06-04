/**
 * PetMi Hub — tokens de cor (paleta própria; não usar colors.brand do PetMi Vet).
 * Fonte de verdade documentada em docs/architecture/HUB_BRANDING.md
 */

const primary500 = '#c86a4d';
const primary200 = '#e7c4af';
const primary50 = '#faf7f4';

export const hubTheme = {
  brand: {
    primary: {
      50: primary50,
      100: '#f5ebe3',
      200: primary200,
      300: '#dcb896',
      400: '#d18968',
      500: primary500,
      600: '#a85a40',
      700: '#8a4a35',
      800: '#6c3b2a',
    },
  },
  accent: {
    lavender: '#a88ab8',
    mint: '#89c2af',
  },
  surface: {
    page: primary50,
    card: '#ede7e2',
    elevated: '#ffffff',
  },
  text: {
    primary: '#4a3b3a',
    secondary: '#8e6e67',
    muted: '#8e6e67',
  },
  border: {
    default: '#d6d6d6',
    subtle: '#ede7e2',
  },
  semantic: {
    success: '#6fa677',
  },
} as const;

export type HubTheme = typeof hubTheme;

export const hubPrimaryHover = hubTheme.brand.primary[600];

export default hubTheme;
