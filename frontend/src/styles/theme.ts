// Design System PetiVet - Tons Pastéis para Pets
export const theme = {
  // Cores principais
  colors: {
    // Primárias - Tons pastéis suaves
    primary: {
      50: '#f8f4ff',   // Lavanda muito clara
      100: '#f0e6ff',  // Lavanda clara
      200: '#e0ccff',  // Lavanda média
      300: '#c7a3ff',  // Lavanda
      400: '#a366ff',  // Roxo pastel
      500: '#8b5cf6',  // Roxo principal
      600: '#7c3aed',  // Roxo escuro
      700: '#6d28d9',  // Roxo mais escuro
      800: '#5b21b6',  // Roxo muito escuro
      900: '#4c1d95',  // Roxo escuro profundo
    },
    
    // Secundárias - Terracota/Laranja pastel
    secondary: {
      50: '#fff7ed',   // Pêssego muito claro
      100: '#ffedd5',  // Pêssego claro
      200: '#fed7aa',  // Pêssego médio
      300: '#fdba74',  // Terracota claro
      400: '#fb923c',  // Terracota
      500: '#f97316',  // Laranja pastel
      600: '#ea580c',  // Laranja médio
      700: '#c2410c',  // Laranja escuro
      800: '#9a3412',  // Terracota escuro
      900: '#7c2d12',  // Terracota profundo
    },
    
    // Accent - Verde menta pastel
    accent: {
      50: '#f0fdf4',   // Menta muito clara
      100: '#dcfce7',  // Menta clara
      200: '#bbf7d0',  // Menta média
      300: '#86efac',  // Verde menta
      400: '#4ade80',  // Verde pastel
      500: '#22c55e',  // Verde principal
      600: '#16a34a',  // Verde médio
      700: '#15803d',  // Verde escuro
      800: '#166534',  // Verde muito escuro
      900: '#14532d',  // Verde profundo
    },
    
    // Neutros - Tons de cinza suaves
    neutral: {
      50: '#fafafa',   // Branco suave
      100: '#f5f5f5',  // Cinza muito claro
      200: '#e5e5e5',  // Cinza claro
      300: '#d4d4d4',  // Cinza médio claro
      400: '#a3a3a3',  // Cinza médio
      500: '#737373',  // Cinza
      600: '#525252',  // Cinza escuro
      700: '#404040',  // Cinza muito escuro
      800: '#262626',  // Cinza profundo
      900: '#171717',  // Preto suave
    },
    
    // Status colors
    success: '#22c55e',  // Verde menta
    warning: '#f59e0b',  // Âmbar pastel
    error: '#ef4444',    // Vermelho suave
    info: '#3b82f6',     // Azul pastel
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

// Cores específicas para componentes
export const componentColors = {
  // Backgrounds
  background: {
    primary: theme.colors.neutral[50],      // Branco suave
    secondary: theme.colors.primary[50],    // Lavanda muito clara
    accent: theme.colors.secondary[50],     // Pêssego muito claro
  },
  
  // Textos
  text: {
    primary: theme.colors.neutral[800],     // Cinza escuro
    secondary: theme.colors.neutral[600],   // Cinza médio
    accent: theme.colors.primary[600],      // Roxo médio
    inverse: theme.colors.neutral[50],      // Branco
  },
  
  // Botões
  button: {
    primary: {
      bg: theme.colors.primary[500],        // Roxo principal
      hover: theme.colors.primary[600],     // Roxo escuro
      text: theme.colors.neutral[50],       // Branco
    },
    secondary: {
      bg: theme.colors.secondary[500],      // Laranja pastel
      hover: theme.colors.secondary[600],  // Laranja médio
      text: theme.colors.neutral[50],       // Branco
    },
    accent: {
      bg: theme.colors.accent[500],         // Verde menta
      hover: theme.colors.accent[600],     // Verde médio
      text: theme.colors.neutral[50],       // Branco
    },
    outline: {
      bg: 'transparent',
      border: theme.colors.primary[300],   // Lavanda
      text: theme.colors.primary[600],     // Roxo médio
      hover: theme.colors.primary[50],     // Lavanda clara
    },
  },
  
  // Cards
  card: {
    bg: theme.colors.neutral[50],           // Branco
    border: theme.colors.neutral[200],      // Cinza claro
    shadow: theme.boxShadow.md,
  },
  
  // Inputs
  input: {
    bg: theme.colors.neutral[50],           // Branco
    border: theme.colors.neutral[300],      // Cinza médio claro
    focus: theme.colors.primary[400],       // Roxo pastel
    placeholder: theme.colors.neutral[400], // Cinza médio
  },
};

export const COLORS = {
  primary: '#8b5cf6',
  background: '#fafafa',
  // add other colors as needed
};

export default theme;
