import React from 'react';
import { Stethoscope, Heart, Building2, Star } from 'lucide-react';

type CategoryType = 'vet' | 'freelancer' | 'clinic' | 'other';

interface CategorySelectionStepProps {
  onSelect: (category: CategoryType) => void;
}

interface CategoryCardData {
  id: CategoryType;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const categories: CategoryCardData[] = [
  {
    id: 'vet',
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    icon: <Stethoscope size={32} />,
    title: 'Buscar Veterinário',
    description: 'Encontre profissionais especializados para consultas, cirurgias e emergências',
    color: '#7c3aed',
  },
  {
    id: 'freelancer',
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    icon: <Heart size={32} fill="currentColor" />,
    title: 'Buscar Freelancer',
    description: 'Grooming, adestramento, passeios e cuidados especializados',
    color: '#f59e0b',
  },
  {
    id: 'clinic',
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    icon: <Building2 size={32} />,
    title: 'Buscar Clínica Parceira',
    description: 'Parcerias com outras clínicas para serviços especializados',
    color: '#0ea5e9',
  },
  {
    id: 'other',
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    icon: <Star size={32} fill="currentColor" />,
    title: 'Outros Profissionais',
    description: 'Consultorias, pesquisa e outros serviços especializados',
    color: '#22c55e',
  },
];

const CategorySelectionStep: React.FC<CategorySelectionStepProps> = ({ onSelect }) => {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Que tipo de profissional você precisa?</h1>
        <p style={styles.subtitle}>
          Escolha a categoria que melhor se adequa à sua necessidade
        </p>
      </div>

      <div style={styles.grid}>
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            style={{
              ...styles.card,
              borderColor: category.color,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = category.color;
              e.currentTarget.style.transform = 'translateY(-8px)';
              e.currentTarget.style.boxShadow = `0 12px 24px ${category.color}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            }}
          >
            <div
              style={{
                ...styles.iconCircle,
                backgroundColor: `${category.color}15`,
              }}
            >
              <span style={styles.icon}>{category.icon}</span>
            </div>
            <h3 style={styles.cardTitle}>{category.title}</h3>
            <p style={styles.cardDescription}>{category.description}</p>
            <div
              style={{
                ...styles.arrow,
                color: category.color,
              }}
            >
              →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '48px 32px',
    maxWidth: '1200px',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '2px solid #e5e5e5',
    borderRadius: '20px',
    padding: '32px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  iconCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  icon: {
    fontSize: '40px',
  },
  cardTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '22px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '12px',
  },
  cardDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '15px',
    color: '#737373',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  arrow: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
};

export default CategorySelectionStep;

