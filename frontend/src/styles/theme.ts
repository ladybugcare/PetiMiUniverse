// Design System PetiMi - Paleta Oficial
import { colors } from './colors';

export const theme = {
  // Cores principais - usando paleta PetiMi
  colors: {
    // Primárias - Rosa Queimado
    primary: {
      50: colors.brand.primary[50],
      100: colors.brand.primary[100],
      200: colors.brand.primary[200],
      300: colors.brand.primary[300],
      400: colors.brand.primary[400],
      500: colors.brand.primary[500],
      600: colors.brand.primary[600],
      700: colors.brand.primary[700],
      800: colors.brand.primary[800],
    },
    
    // Secundárias - Nude/Bege Rosado Quente
    secondary: {
      100: colors.brand.secondary[100],
      200: colors.brand.secondary[200],
      300: colors.brand.secondary[300],
      400: colors.brand.secondary[400],
      500: colors.brand.secondary[500],
    },
    
    // Accent - Verde Sálvia Suave
    accent: {
      100: colors.accent.sage[100],
      200: colors.accent.sage[200],
      300: colors.accent.sage[300],
      400: colors.accent.sage[400],
      500: colors.accent.sage[500],
    },
    
    // Info - Azul Neblina
    info: {
      100: colors.info[100],
      200: colors.info[200],
      300: colors.info[300],
      400: colors.info[400],
      500: colors.info[500],
    },
    
    // Neutros Quentes
    neutral: {
      50: colors.neutral[50],
      100: colors.neutral[100],
      200: colors.neutral[200],
      300: colors.neutral[300],
      400: colors.neutral[400],
      500: colors.neutral[500],
      600: colors.neutral[600],
      700: colors.neutral[700],
      800: colors.neutral[800],
      900: colors.neutral[900],
    },
    
    // Status colors
    success: colors.success[500],
    successLight: colors.success[100],
    successDark: colors.success[700],
    warning: colors.warning[500],
    warningLight: colors.warning[100],
    warningDark: colors.warning[700],
    error: colors.error[500],
    errorLight: colors.error[100],
    errorDark: colors.error[700],
    infoColor: colors.info[500],
    infoLight: colors.info[100],
  },
  
  // Tipografia
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      display: ['Poppins', 'system-ui', 'sans-serif'],
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem', // 36px
      '5xl': '3rem',    // 48px
    },
    fontWeight: {
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
  },
  
  // Espaçamentos
  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
  },
  
  // Border radius
  borderRadius: {
    none: '0',
    sm: '0.125rem',   // 2px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    '3xl': '1.5rem',  // 24px
    full: '9999px',
  },
  
  // Shadows
  boxShadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  
  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
};

// Cores específicas para componentes (usando paleta PetiMi)
export const componentColors = {
  // Backgrounds
  background: {
    primary: theme.colors.neutral[50],      // Branco suave quente
    secondary: theme.colors.primary[50],    // Rosa queimado muito claro
    accent: theme.colors.secondary[100],    // Nude muito claro
  },
  
  // Textos
  text: {
    primary: theme.colors.neutral[900],     // Neutro quente escuro
    secondary: theme.colors.neutral[600],   // Neutro quente médio
    accent: theme.colors.primary[600],      // Rosa queimado médio
    inverse: theme.colors.neutral[50],      // Branco suave
  },
  
  // Botões
  button: {
    primary: {
      bg: theme.colors.primary[500],        // Rosa queimado principal
      hover: theme.colors.primary[600],     // Rosa queimado profundo
      text: theme.colors.neutral[50],       // Branco suave
    },
    secondary: {
      bg: theme.colors.secondary[500],      // Nude/bege principal
      hover: theme.colors.secondary[400],  // Nude/bege mais escuro
      text: theme.colors.neutral[50],       // Branco suave
    },
    accent: {
      bg: theme.colors.accent[500],         // Verde sálvia
      hover: theme.colors.accent[400],     // Verde sálvia mais escuro
      text: theme.colors.neutral[50],       // Branco suave
    },
    outline: {
      bg: 'transparent',
      border: theme.colors.primary[300],   // Rosa queimado leve
      text: theme.colors.primary[600],     // Rosa queimado médio
      hover: theme.colors.primary[50],     // Rosa queimado muito claro
    },
  },
  
  // Cards
  card: {
    bg: theme.colors.neutral[50],           // Branco suave
    border: theme.colors.neutral[200],      // Neutro quente claro
    shadow: theme.boxShadow.md,
  },
  
  // Inputs
  input: {
    bg: theme.colors.neutral[50],           // Branco suave
    border: theme.colors.neutral[300],      // Neutro quente médio claro
    focus: theme.colors.primary[400],       // Rosa queimado médio
    placeholder: theme.colors.neutral[400], // Neutro quente médio
  },
};

export const COLORS = {
  primary: theme.colors.primary[500],
  background: theme.colors.neutral[50],
};

export default theme;
