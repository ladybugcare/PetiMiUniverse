import React from 'react';
import { User } from 'lucide-react';
import colors from '../styles/colors';
import { getUserTypeColor, UserType } from '../utils/userTypeColors';

interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
  style?: React.CSSProperties;
  userType?: UserType; // Tipo de usuário para determinar a cor do avatar
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 40, style, userType }) => {
  const [imageError, setImageError] = React.useState(false);

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getBackgroundColor = (name: string, type?: UserType) => {
    // Se o tipo for fornecido, usar a cor padronizada
    if (type) {
      return getUserTypeColor(type);
    }
    
    // Fallback: usar cores baseadas no nome (para compatibilidade)
    const avatarColors = [
      colors.brand.primary[500], colors.brand.primary[500], '#c084fc',
      '#f97316', '#fb923c', '#fdba74',
      '#22c55e', '#4ade80', '#86efac',
      '#3b82f6', '#60a5fa', '#93c5fd',
    ];
    const index = name.charCodeAt(0) % avatarColors.length;
    return avatarColors[index];
  };

  // Reset imageError when src changes
  React.useEffect(() => {
    setImageError(false);
  }, [src]);

  const avatarStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    borderRadius: '50%',
    flexShrink: 0,
    aspectRatio: '1 / 1',
    ...style,
  };

  // Se tem src e não houve erro, tentar mostrar imagem
  if (src && !imageError) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        onError={() => setImageError(true)}
        style={{
          ...avatarStyle,
          objectFit: 'cover',
        }}
      />
    );
  }

  if (name) {
    return (
      <div
        style={{
          ...avatarStyle,
          backgroundColor: getBackgroundColor(name, userType),
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.4,
          fontWeight: '600',
        }}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div
      style={{
        ...avatarStyle,
        backgroundColor: colors.neutral[200],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <User size={size * 0.6} color={colors.neutral[500]} />
    </div>
  );
};

export default Avatar;

