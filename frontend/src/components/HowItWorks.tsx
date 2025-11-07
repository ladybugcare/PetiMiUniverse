import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  PressableStateCallbackType,
} from 'react-native';
import { Building2, Stethoscope, Heart } from 'lucide-react';
import colors from '../styles/colors';
import IconWrapper from './IconWrapper';

// Extend PressableStateCallbackType to include hover state (React Native Web)
type PressableStateWithHover = PressableStateCallbackType & {
  hovered?: boolean;
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
    icon: <IconWrapper icon={Building2} size={32} color={colors.primary} />,
    title: 'Para Clínicas',
    description: 'Publique demandas, visualize perfis de veterinários e freelancers, e contrate com segurança e agilidade.',
    emphasis: 'Encontre profissionais quando mais precisa.',
  },
  {
    id: 'vets',
    icon: <IconWrapper icon={Stethoscope} size={32} color={colors.primary} />,
    title: 'Para Veterinários',
    description: 'Candidata-se a demandas de clínicas, exiba suas especialidades e amplie sua rede de parceiros na área.',
    emphasis: 'Conecte-se a novas oportunidades.',
  },
  {
    id: 'freelancers',
    icon: <IconWrapper icon={Heart} size={32} color={colors.primary} fill={colors.primary} />,
    title: 'Para Freelancers',
    description: 'Groomers, adestradores, cuidadores e outros profissionais encontram aqui espaço para se destacar.',
    emphasis: 'Ofereça seus serviços ao mundo pet.',
  },
];

const HowItWorks: React.FC = () => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <View style={styles.section}>
      <View style={styles.wrapper}>
        <Text style={styles.title}>Como o PetiVet funciona</Text>
        <Text style={styles.subtitle}>
          Uma plataforma feita para unir quem oferece cuidado e quem precisa dele. Tudo em um só lugar — simples, rápido e cheio de amor pelos pets.
        </Text>

        {isDesktop ? (
          <View style={styles.grid}>
            {cards.map((card) => (
              <HowItWorksCard
                key={card.id}
                card={card}
                variant="grid"
              />
            ))}
          </View>
        ) : (
          <View style={styles.stack}>
            {cards.map((card) => (
              <HowItWorksCard
                key={card.id}
                card={card}
                variant="stack"
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

type HowItWorksCardProps = {
  card: AudienceCard;
  variant: 'grid' | 'stack';
};

const HowItWorksCard: React.FC<HowItWorksCardProps> = ({ card, variant }) => {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ hovered }: PressableStateWithHover) => [
        styles.card,
        variant === 'grid' ? styles.cardGrid : styles.cardStack,
        hovered && styles.cardHovered,
      ]}
    >
      {({ hovered }: PressableStateWithHover) => (
        <View style={styles.cardContent}>
          <View
            style={[
              styles.iconBubble,
              hovered && styles.iconBubbleHovered,
            ]}
          >
            {card.icon}
          </View>
          <Text style={styles.cardLabel}>{card.title}</Text>
          <Text
            style={[
              styles.cardEmphasis,
              hovered && styles.cardEmphasisHovered,
            ]}
          >
            {card.emphasis}
          </Text>
          <Text style={styles.cardDescription}>{card.description}</Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#F6F6FF',
    paddingVertical: 64,
    paddingHorizontal: 16,
  },
  wrapper: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 32,
    fontWeight: '600',
    color: '#2f1f69',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 16,
    fontFamily: 'Inter, sans-serif',
    fontSize: 18,
    lineHeight: 26,
    color: '#594a84',
    textAlign: 'center',
    maxWidth: 720,
    alignSelf: 'center',
  },
  grid: {
    marginTop: 40,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
  },
  stack: {
    marginTop: 32,
    flexDirection: 'column',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    shadowColor: '#7c3aed',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    borderWidth: 1,
    borderColor: '#e6e1ff',
  },
  cardGrid: {
    width: '32%',
  },
  cardStack: {
    width: '100%',
    marginBottom: 20,
  },
  cardHovered: {
    shadowOpacity: 0.18,
    shadowRadius: 24,
    transform: [{ translateY: -4 }],
    borderColor: '#c7b8ff',
  },
  cardContent: {
    flexDirection: 'column',
  },
  iconBubble: {
    height: 56,
    width: 56,
    borderRadius: 28,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  iconBubbleHovered: {
    backgroundColor: '#dcd4ff',
  },
  cardLabel: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 18,
    fontWeight: '600',
    color: '#27144b',
    marginTop: 20,
  },
  cardEmphasis: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 16,
    fontWeight: '500',
    color: '#6a5bb3',
    marginTop: 8,
  },
  cardEmphasisHovered: {
    color: '#7c3aed',
  },
  cardDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 15,
    lineHeight: 22,
    color: '#4b3f75',
    marginTop: 8,
  },
});

export default HowItWorks;
