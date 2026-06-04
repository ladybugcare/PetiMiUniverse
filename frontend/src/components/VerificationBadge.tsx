import React from 'react';
import { CheckCircle } from 'lucide-react';

interface VerificationBadgeProps {
  verified?: boolean;
  text?: string;
}

const VerificationBadge: React.FC<VerificationBadgeProps> = ({ 
  verified = true, 
  text = 'Documentos validados pela PetMi Vet' 
}) => {
  if (!verified) return null;

  return (
    <div style={styles.badge}>
      <CheckCircle size={16} color="#22c55e" />
      <span style={styles.badgeText}>{text}</span>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: '#dcfce7',
    borderRadius: '20px',
    border: '1px solid #22c55e',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '500',
    color: '#166534',
  },
  badgeText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '500',
    color: '#166534',
  },
};

export default VerificationBadge;

