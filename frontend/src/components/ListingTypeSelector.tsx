import React from 'react';
import { ShoppingBag, Search } from 'lucide-react';

type ListingType = 'sale' | 'wanted';

interface ListingTypeSelectorProps {
  onSelect: (type: ListingType) => void;
}

interface TypeCardData {
  id: ListingType;
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}

const listingTypes: TypeCardData[] = [
  {
    id: 'sale',
    icon: <ShoppingBag size={48} />,
    title: 'VENDER',
    description: 'Tenho equipamentos, medicamentos ou suprimentos para vender',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  },
  {
    id: 'wanted',
    icon: <Search size={48} />,
    title: 'PROCURAR',
    description: 'Estou procurando comprar equipamentos ou produtos veterinários',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  },
];

const ListingTypeSelector: React.FC<ListingTypeSelectorProps> = ({ onSelect }) => {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>O que você deseja fazer?</h1>
        <p style={styles.subtitle}>
          Escolha se você quer vender produtos ou se está procurando algo para comprar
        </p>
      </div>

      <div style={styles.grid}>
        {listingTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => onSelect(type.id)}
            style={{
              ...styles.card,
              background: type.gradient,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.1)';
            }}
          >
            <div style={styles.iconCircle}>
              <span style={styles.icon}>{type.icon}</span>
            </div>
            <h2 style={styles.cardTitle}>{type.title}</h2>
            <p style={styles.cardDescription}>{type.description}</p>
            <div style={styles.arrow}>→</div>
          </button>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '48px 32px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '36px',
    fontWeight: '700',
    color: '#262626',
    marginBottom: '16px',
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '18px',
    color: '#737373',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '32px',
  },
  card: {
    padding: '48px 32px',
    borderRadius: '24px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
  },
  iconCircle: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
    backdropFilter: 'blur(10px)',
  },
  icon: {
    fontSize: '50px',
  },
  cardTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '16px',
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  },
  cardDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  arrow: {
    fontSize: '32px',
    color: '#ffffff',
    fontWeight: 'bold',
  },
};

export default ListingTypeSelector;

