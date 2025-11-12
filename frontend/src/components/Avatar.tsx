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
    const colors = [
      '#7c3aed', '#a855f7', '#c084fc',
      '#f97316', '#fb923c', '#fdba74',
      '#22c55e', '#4ade80', '#86efac',
      '#3b82f6', '#60a5fa', '#93c5fd',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          ...style,
        }}
      />
    );
  }

  if (name) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: getBackgroundColor(name, userType),
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.4,
          fontWeight: '600',
          ...style,
        }}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: colors.neutral[200],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <User size={size * 0.6} color={colors.neutral[500]} />
    </div>
  );
};

export default Avatar;

