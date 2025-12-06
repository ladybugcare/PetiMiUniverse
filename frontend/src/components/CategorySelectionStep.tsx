import React, { useState, useEffect } from 'react';
import { Stethoscope, Heart, Building2, Star } from 'lucide-react';
import IconWrapper from './IconWrapper';
import { colors } from '../styles/colors';

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
    icon: <IconWrapper icon={Stethoscope} size={32} />,
    title: 'Criar Demanda para Veterinário',
    description: 'Publique uma vaga para consultas, cirurgias ou atendimentos emergenciais e receba candidaturas.',
    color: colors.brand.primary[500],
  },
  {
    id: 'freelancer',
    icon: <IconWrapper icon={Heart} size={32} fill="currentColor" />,
    title: 'Criar Demanda para Freelancer',
    description: 'Abra uma demanda para grooming, adestramento, passeios ou cuidados especializados.',
    color: '#f59e0b',
  },
  {
    id: 'clinic',
    icon: <IconWrapper icon={Building2} size={32} />,
    title: 'Criar Demanda para Clínica Parceira',
    description: 'Solicite suporte de outras clínicas para serviços especializados.',
    color: '#0ea5e9',
  },
  {
    id: 'other',
    icon: <IconWrapper icon={Star} size={32} fill="currentColor" />,
    title: 'Criar Demanda para Outros Profissionais',
    description: 'Crie demandas para consultorias e serviços técnicos especializados.',
    color: '#22c55e',
  },
];

const CategorySelectionStep: React.FC<CategorySelectionStepProps> = ({ onSelect }) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determinar número de colunas baseado na largura da tela
  const getGridColumns = () => {
    if (windowWidth >= 1200) {
      return 'repeat(4, 1fr)'; // Todos na mesma linha em telas grandes
    } else if (windowWidth >= 768) {
      return 'repeat(2, 1fr)'; // 2 por linha em telas médias
    } else {
      return '1fr'; // 1 por linha em mobile
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Que tipo de demanda você deseja abrir?</h1>
        <p style={styles.subtitle}>
          Selecione a categoria para criar uma demanda e receber candidaturas de profissionais qualificados.
        </p>
      </div>

      <div style={{ ...styles.grid, gridTemplateColumns: getGridColumns() }}>
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
    gap: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
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

