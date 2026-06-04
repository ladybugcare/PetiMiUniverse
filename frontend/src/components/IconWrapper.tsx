import React from 'react';

interface IconWrapperProps {
  icon: React.ComponentType<any>;
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}

/**
 * Wrapper component para ícones do lucide-react
 * Resolve problemas de incompatibilidade entre React 18 e lucide-react
 * 
 * @example
 * <IconWrapper icon={Info} size={16} color={colors.brand.primary[500]} />
 */
export const IconWrapper: React.FC<IconWrapperProps> = ({ 
  icon: Icon, 
  size, 
  color, 
  fill,
  strokeWidth,
  className,
  style,
  ...props 
}) => {
  // Usa React.createElement para garantir que o elemento seja criado corretamente
  // Isso resolve problemas de compatibilidade entre React 18 e lucide-react
  return React.createElement(Icon, {
    size,
    color,
    fill: fill !== undefined ? fill : 'none', // Garante que o fill padrão seja 'none' (transparente)
    strokeWidth,
    className,
    style: {
      backgroundColor: 'transparent', // Garante fundo transparente
      ...style,
    },
    ...props
  });
};

export default IconWrapper;

