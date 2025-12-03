// PetiVet Design System - Color Palette

export const colors = {
  // Primary Colors (Purple - PetiVet Brand)
  primary: '#7c3aed',
  primaryDark: '#5b21b6',
  primaryLight: '#a78bfa',
  primaryLighter: '#c4b5fd',
  primaryBg: '#f3e8ff',
  
  // Secondary Colors (Pink - Accents)
  secondary: '#ec4899',
  secondaryDark: '#be185d',
  secondaryLight: '#f9a8d4',
  
  // Semantic Colors
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  info: '#6366f1',
  infoLight: '#e0e7ff',
  
  // Neutral Colors
  neutral: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  
  // Application Colors
  background: '#f9fafb',
  surface: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  borderDark: '#d1d5db',
  
  // Convenience aliases
  lightGray: '#f3f4f6', // neutral.100
  darkGray: '#6b7280',   // neutral.500
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
};

// Helper function for hover states
export const getHoverColor = (baseColor: string): string => {
  const hoverMap: { [key: string]: string } = {
    [colors.primary]: colors.primaryDark,
    [colors.secondary]: colors.secondaryDark,
    [colors.success]: '#059669',
    [colors.warning]: '#d97706',
    [colors.danger]: '#dc2626',
  };
  
  return hoverMap[baseColor] || baseColor;
};

export default colors;

