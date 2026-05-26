import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';

interface HubAvatarProps {
  src?: string;
  name?: string;
  size?: number;
}

const clinicAccent = '#c86a4d';

const HubAvatar: React.FC<HubAvatarProps> = ({ src, name, size = 40 }) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [src]);

  const initials = (() => {
    const n = (name || 'U').trim();
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.substring(0, 2).toUpperCase();
  })();

  const box: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (src && !imageError) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setImageError(true)}
        style={{ ...box, objectFit: 'cover' }}
      />
    );
  }

  if (name) {
    return (
      <div
        style={{
          ...box,
          backgroundColor: clinicAccent,
          color: '#fff',
          fontSize: size * 0.35,
          fontWeight: 600,
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div style={{ ...box, backgroundColor: '#e5e5e5', color: '#525252' }}>
      <User size={size * 0.45} strokeWidth={1.75} />
    </div>
  );
};

export default HubAvatar;
