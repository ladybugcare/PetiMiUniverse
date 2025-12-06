// PetiMi Design System - Paleta Oficial
// Rosa Queimado, Nude/Bege, Verde Sálvia, Azul Neblina, Neutros Quentes

export const colors = {
  // Brand Primary - Rosa Queimado (cor oficial)
  brand: {
    primary: {
      50: '#FFF7F6',   // quase branco rosado
      100: '#FCEAEA',  // rosado bem claro
      200: '#F5D1D0',  // rosa queimado clarinho
      300: '#E9B0AF',  // rosa queimado leve
      400: '#D98C8B',  // rosa queimado médio
      500: '#C46C6A',  // ⭐ Rosa queimado principal
      600: '#A75251',  // rosa queimado mais profundo
      700: '#8B3F3F',  // tom forte para textos contrastantes
      800: '#6F2F30',  // quase vinho rosado queimado
    },
    // Secondary - Nude/Bege Rosado Quente
    secondary: {
      100: '#FAF3EF',
      200: '#F1E1D9',
      300: '#E5CBBF',
      400: '#D3B2A5',
      500: '#C09A8D',
    }
  },
  
  // Accent - Verde Sálvia Suave
  accent: {
    sage: {
      100: '#F3F6F3',
      200: '#E3EDE5',
      300: '#C7D8CB',
      400: '#A7C2B0',
      500: '#7FA895',
    }
  },
  
  // Info - Azul Neblina
  info: {
    100: '#F2F6F9',
    200: '#DFE9F0',
    300: '#C4D7E2',
    400: '#A5C1D1',
    500: '#7EA4BA',
  },
  
  // Estados
  success: {
    100: '#E7F4EF',
    500: '#4E9B7A',
    700: '#2F6B52',
  },
  
  warning: {
    100: '#FFF7EA',
    500: '#D68A28',
    700: '#915D18',
  },
  
  error: {
    100: '#FBEDEC',
    500: '#C7514A',
    700: '#8A2F2A',
  },
  
  // Neutros Quentes (Warm Neutrals)
  neutral: {
    50: '#FFFCFB',
    100: '#F7F3F2',
    200: '#E9E3E1',
    300: '#D6CECC',
    400: '#BFB7B4',
    500: '#A29B98',
    600: '#7F7A77',
    700: '#5D5957',
    800: '#3E3B3A',
    900: '#2A2726',
  },
  
  // Application Colors (mapeados para novos tokens)
  background: '#FFFCFB',  // neutral.50
  surface: '#FFFFFF',
  text: '#2A2726',         // neutral.900
  textSecondary: '#7F7A77', // neutral.600
  textMuted: '#A29B98',    // neutral.500
  border: '#E9E3E1',       // neutral.200
  borderDark: '#D6CECC',   // neutral.300
  overlay: 'rgba(42, 39, 38, 0.5)', // neutral.900 com opacidade
  
  // Convenience aliases (mapeados para nova estrutura)
  lightGray: '#F7F3F2', // neutral.100
  darkGray: '#7F7A77',   // neutral.600
};

// Helper function for hover states (usando apenas cores PetiMi)
export const getHoverColor = (baseColor: string): string => {
  const hoverMap: { [key: string]: string } = {
    [colors.brand.primary[500]]: colors.brand.primary[600],
    [colors.brand.primary[400]]: colors.brand.primary[500],
    [colors.brand.primary[300]]: colors.brand.primary[400],
    [colors.brand.secondary[500]]: colors.brand.secondary[400],
    [colors.brand.secondary[400]]: colors.brand.secondary[300],
    [colors.success[500]]: colors.success[700],
    [colors.warning[500]]: colors.warning[700],
    [colors.error[500]]: colors.error[700],
    [colors.info[500]]: colors.info[400],
    [colors.accent.sage[500]]: colors.accent.sage[400],
  };
  
  return hoverMap[baseColor] || baseColor;
};

export default colors;
