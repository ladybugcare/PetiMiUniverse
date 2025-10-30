import React from 'react';
import { LucideIcon } from 'lucide-react';
import colors from '../styles/colors';

interface IconButtonProps {
  icon: LucideIcon;
  label?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  iconSize?: number;
}

/**
 * Componente de botão com ícone usando Lucide Icons
 * 
 * @example
 * ```tsx
 * import { Plus, Edit, Trash2 } from 'lucide-react';
 * 
 * <IconButton icon={Plus} label="Adicionar" variant="primary" />
 * <IconButton icon={Edit} onClick={handleEdit} variant="ghost" />
 * <IconButton icon={Trash2} variant="outline" size="sm" />
 * ```
 */
const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  iconSize,
}) => {
  const sizeStyles = {
    sm: {
      padding: '8px 16px',
      fontSize: '14px',
      iconSize: iconSize || 16,
    },
    md: {
      padding: '12px 24px',
      fontSize: '14px',
      iconSize: iconSize || 18,
    },
    lg: {
      padding: '14px 28px',
      fontSize: '16px',
      iconSize: iconSize || 20,
    },
  };

  const variantStyles = {
    primary: {
      backgroundColor: colors.primary,
      color: colors.surface,
      border: 'none',
      hover: colors.primaryDark,
    },
    secondary: {
      backgroundColor: colors.neutral[100],
      color: colors.text,
      border: 'none',
      hover: colors.neutral[200],
    },
    outline: {
      backgroundColor: 'transparent',
      color: colors.primary,
      border: `1px solid ${colors.border}`,
      hover: colors.neutral[50],
    },
    ghost: {
      backgroundColor: 'transparent',
      color: colors.textSecondary,
      border: 'none',
      hover: colors.neutral[50],
    },
  };

  const currentSize = sizeStyles[size];
  const currentVariant = variantStyles[variant];

  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: label ? '8px' : '0',
        padding: currentSize.padding,
        backgroundColor: isHovered && !disabled ? currentVariant.hover : currentVariant.backgroundColor,
        color: currentVariant.color,
        border: currentVariant.border,
        borderRadius: '8px',
        fontSize: currentSize.fontSize,
        fontWeight: '600',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        opacity: disabled ? 0.5 : 1,
        outline: 'none',
      }}
    >
      <Icon size={currentSize.iconSize} />
      {label && <span>{label}</span>}
    </button>
  );
};

export default IconButton;

