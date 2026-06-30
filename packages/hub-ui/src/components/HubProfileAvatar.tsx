import React from 'react';

export function profileInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

type Props = {
  name: string;
  className?: string;
};

export const HubProfileAvatar: React.FC<Props> = ({ name, className }) => (
  <div className={className ?? 'hub-meu-perfil__avatar-initials'} aria-hidden>
    {profileInitials(name)}
  </div>
);
