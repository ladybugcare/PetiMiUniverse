import React, { useState, useEffect } from 'react';
import { Building2, Stethoscope, Heart } from 'lucide-react';
import colors from '../styles/colors';
import IconWrapper from './IconWrapper';

// Hook customizado para web (substitui useWindowDimensions do react-native)
const useWindowDimensions = () => {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return dimensions;
};

type AudienceCard = {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  emphasis: string;
};

const cards: AudienceCard[] = [
  {
    id: 'clinics',
    icon: <IconWrapper icon={Building2} size={32} color={colors.brand.primary[500]} />,
    title: 'Para Clínicas',
    description: 'Publique demandas, visualize perfis de veterinários e freelancers, e contrate com segurança e agilidade.',
    emphasis: 'Encontre profissionais quando mais precisa.',
  },
  {
    id: 'vets',
    icon: <IconWrapper icon={Stethoscope} size={32} color={colors.brand.primary[500]} />,
    title: 'Para Veterinários',
    description: 'Candidata-se a demandas de clínicas, exiba suas especialidades e amplie sua rede de parceiros na área.',
    emphasis: 'Conecte-se a novas oportunidades.',
  },
  {
    id: 'freelancers',
    icon: <IconWrapper icon={Heart} size={32} color={colors.brand.primary[500]} />,
    title: 'Para Freelancers',
    description: 'Groomers, adestradores, cuidadores e outros profissionais encontram aqui espaço para se destacar.',
    emphasis: 'Ofereça seus serviços ao mundo pet.',
  },
];

const HowItWorks: React.FC = () => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <section id="sobre" style={styles.section}>
      <div style={styles.wrapper}>
        <h2 style={styles.title}>Como o PetiMi funciona</h2>
        <p style={styles.subtitle}>
          Uma plataforma feita para unir quem oferece cuidado e quem precisa dele. Tudo em um só lugar — simples, rápido e cheio de amor pelos pets.
        </p>

        {isDesktop ? (
          <div style={styles.grid}>
            {cards.map((card) => (
              <HowItWorksCard
                key={card.id}
                card={card}
                variant="grid"
              />
            ))}
          </div>
        ) : (
          <div style={styles.stack}>
            {cards.map((card) => (
              <HowItWorksCard
                key={card.id}
                card={card}
                variant="stack"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

type HowItWorksCardProps = {
  card: AudienceCard;
  variant: 'grid' | 'stack';
};

const HowItWorksCard: React.FC<HowItWorksCardProps> = ({ card, variant }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      style={{
        ...styles.card,
        ...(variant === 'grid' ? styles.cardGrid : styles.cardStack),
        ...(isHovered ? styles.cardHovered : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
        }
      }}
    >
      <div style={styles.cardContent}>
        <div
          style={{
            ...styles.iconBubble,
            ...(isHovered ? styles.iconBubbleHovered : {}),
          }}
        >
          {card.icon}
        </div>
        <h3 style={styles.cardLabel}>{card.title}</h3>
        <p
          style={{
            ...styles.cardEmphasis,
            ...(isHovered ? styles.cardEmphasisHovered : {}),
          }}
        >
          {card.emphasis}
        </p>
        <p style={styles.cardDescription}>{card.description}</p>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  section: {
    backgroundColor: colors.neutral[50],
    paddingTop: '64px',
    paddingBottom: '64px',
    paddingLeft: '16px',
    paddingRight: '16px',
  },
  wrapper: {
    maxWidth: '1080px',
    width: '100%',
    margin: '0 auto',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '600',
    color: colors.neutral[900],
    textAlign: 'center',
    margin: 0,
    marginBottom: '16px',
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '18px',
    lineHeight: '26px',
    color: colors.neutral[600],
    textAlign: 'center',
    maxWidth: '720px',
    margin: '0 auto',
    marginTop: '16px',
  },
  grid: {
    marginTop: '40px',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: '20px',
  },
  stack: {
    marginTop: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '28px',
    paddingTop: '28px',
    paddingBottom: '28px',
    paddingLeft: '24px',
    paddingRight: '24px',
    boxShadow: '0 8px 16px rgba(196, 108, 106, 0.1)',
    border: `1px solid ${colors.neutral[200]}`,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  cardGrid: {
    width: '32%',
    flex: '0 0 32%',
  },
  cardStack: {
    width: '100%',
  },
  cardHovered: {
    boxShadow: '0 12px 24px rgba(196, 108, 106, 0.18)',
    transform: 'translateY(-4px)',
    borderColor: colors.brand.primary[300],
  },
  cardContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  iconBubble: {
    height: '56px',
    width: '56px',
    borderRadius: '28px',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    transition: 'background-color 0.3s ease',
  },
  iconBubbleHovered: {
    backgroundColor: 'transparent',
  },
  cardLabel: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: colors.neutral[900],
    marginTop: '20px',
    marginBottom: '8px',
    margin: 0,
  },
  cardEmphasis: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '500',
    color: colors.brand.primary[600],
    marginTop: '8px',
    marginBottom: '8px',
    margin: 0,
    transition: 'color 0.3s ease',
  },
  cardEmphasisHovered: {
    color: colors.brand.primary[500],
  },
  cardDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '15px',
    lineHeight: '22px',
    color: colors.neutral[700],
    marginTop: '8px',
    margin: 0,
  },
};

export default HowItWorks;
