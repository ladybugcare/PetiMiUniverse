import React from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const actionCards = [
  {
    title: 'Cadastrar Clínica',
    description: 'Registre sua clínica veterinária e publique oportunidades de trabalho.',
    icon: '🏥',
    route: 'ClinicSignup' as const,
  },
  {
    title: 'Cadastrar Veterinário',
    description: 'Registre-se como profissional e encontre as melhores oportunidades.',
    icon: '🩺',
    route: 'VetSignup' as const,
  },
  {
    title: 'Ver Demandas',
    description: 'Visualize todas as demandas abertas por clínicas veterinárias.',
    icon: '📋',
    route: 'Demands' as const,
  },
  {
    title: 'Login',
    description: 'Acesse sua conta para gerenciar suas informações e candidaturas.',
    icon: '🔐',
    route: 'Login' as const,
  },
];

const timelineSteps = [
  {
    number: '1',
    icon: '🏥',
    title: 'Clínicas se cadastram',
    description:
      'Clínicas veterinárias registram suas informações e criam demandas de trabalho.',
  },
  {
    number: '2',
    icon: '🩺',
    title: 'Veterinários se candidatam',
    description:
      'Profissionais qualificados visualizam e se candidatam às oportunidades disponíveis.',
  },
  {
    number: '3',
    icon: '✅',
    title: 'Conexão estabelecida',
    description:
      'Clínicas escolhem os melhores profissionais para suas necessidades.',
  },
];

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const isWeb = Platform.OS === 'web';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.heroSection}>
        <Text style={styles.heroTitle}>PetiVet 🐾</Text>
        <Text style={styles.heroSubtitle}>
          Conectando clínicas e veterinários
        </Text>
        <Text style={styles.heroDescription}>
          A plataforma que revoluciona o atendimento veterinário, facilitando a{' '}
          {'\n'}
          conexão entre clínicas e profissionais qualificados.
        </Text>

        <View
          style={[
            styles.heroCtaRow,
            isWeb ? styles.heroCtaRowHorizontal : styles.heroCtaRowVertical,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('ClinicSignup')}
            style={[
              styles.heroButton,
              styles.heroButtonPrimary,
              isWeb ? styles.heroButtonHorizontal : styles.heroButtonVertical,
            ]}
          >
            <Text style={[styles.heroButtonText, styles.heroButtonPrimaryText]}>
              🏥 Cadastrar Clínica
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('VetSignup')}
            style={[
              styles.heroButton,
              styles.heroButtonSecondary,
              isWeb ? styles.heroButtonHorizontal : styles.heroButtonVertical,
            ]}
          >
            <Text style={[styles.heroButtonText, styles.heroButtonSecondaryText]}>
              🩺 Cadastrar Veterinário
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionCards}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>O que você pode fazer?</Text>
          <Text style={styles.sectionSubtitle}>
            Escolha a opção que melhor se adequa ao seu perfil
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          {actionCards.map((card) => (
            <Pressable
              key={card.title}
              onPress={() => navigation.navigate(card.route)}
              style={[
                styles.card,
                isWeb ? styles.cardWeb : styles.cardMobile,
              ]}
            >
              <View style={styles.cardIconWrapper}>
                <Text style={styles.cardIcon}>{card.icon}</Text>
              </View>

              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.sectionTimeline}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, styles.timelineTitle]}>
            Como funciona?
          </Text>
          <Text style={[styles.sectionSubtitle, styles.timelineSubtitle]}>
            Um processo simples e eficiente para conectar clínicas e veterinários
          </Text>
        </View>

        <View
          style={[
            styles.timelineContainer,
            isWeb ? styles.timelineContainerHorizontal : undefined,
          ]}
        >
          {timelineSteps.map((step) => (
            <View
              key={step.number}
              style={[
                styles.timelineCard,
                isWeb ? styles.timelineCardWeb : styles.timelineCardMobile,
              ]}
            >
              <View style={styles.timelineBadge}>
                <Text style={styles.timelineIcon}>{step.icon}</Text>
                <View style={styles.timelineNumber}>
                  <Text style={styles.timelineNumberText}>{step.number}</Text>
                </View>
              </View>
              <Text style={styles.timelineTitleText}>{step.title}</Text>
              <Text style={styles.timelineDescription}>{step.description}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionCta}>
        <Text style={styles.ctaTitle}>Pronto para começar?</Text>
        <Text style={styles.ctaDescription}>
          Junte-se à comunidade PetiVet e faça parte da revolução no atendimento
          veterinário.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.ctaButton}
          onPress={() => navigation.navigate('ClinicSignup')}
        >
          <Text style={styles.ctaButtonText}>Começar Agora</Text>
        </Pressable>
      </View>

      <View
        style={[styles.footer, isWeb ? styles.footerWeb : undefined]}
      >
        <View
          style={[
            styles.footerColumn,
            isWeb ? styles.footerColumnWeb : undefined,
          ]}
        >
          <Text style={styles.footerTitle}>PetiVet 🐾</Text>
          <Text style={styles.footerText}>
            Conectando clínicas e veterinários para melhor atender nossos amigos
            de quatro patas.
          </Text>
        </View>

        <View
          style={[
            styles.footerColumn,
            isWeb ? styles.footerColumnWeb : undefined,
          ]}
        >
          <Text style={styles.footerColumnTitle}>Links Rápidos</Text>
          {actionCards.map((card) => (
            <Pressable
              key={`footer-${card.title}`}
              onPress={() => navigation.navigate(card.route)}
              style={styles.footerLink}
            >
              <Text style={styles.footerLinkText}>{card.title}</Text>
            </Pressable>
          ))}
        </View>

        <View
          style={[
            styles.footerColumn,
            isWeb ? styles.footerColumnWeb : undefined,
          ]}
        >
          <Text style={styles.footerColumnTitle}>Contato</Text>
          <Text style={styles.footerText}>contato@petivet.com</Text>
          <Text style={styles.footerText}>+55 (11) 99999-9999</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    paddingBottom: 48,
    backgroundColor: '#ffffff',
  },
  heroSection: {
    backgroundColor: '#8b5cf6',
    paddingTop: 96,
    paddingBottom: 96,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 22,
    color: '#f2e9ff',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 12,
  },
  heroDescription: {
    fontSize: 18,
    color: '#f5efff',
    textAlign: 'center',
    maxWidth: 720,
    lineHeight: 26,
    marginBottom: 32,
  },
  heroCtaRow: {
    width: '100%',
    alignItems: 'center',
  },
  heroCtaRowHorizontal: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  heroCtaRowVertical: {
    flexDirection: 'column',
  },
  heroButton: {
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 6,
  },
  heroButtonHorizontal: {
    marginHorizontal: 12,
  },
  heroButtonVertical: {
    marginVertical: 8,
  },
  heroButtonPrimary: {
    backgroundColor: '#ffffff',
  },
  heroButtonSecondary: {
    backgroundColor: '#fdfaff',
  },
  heroButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  heroButtonPrimaryText: {
    color: '#6b21a8',
  },
  heroButtonSecondaryText: {
    color: '#7c3aed',
  },
  sectionCards: {
    backgroundColor: '#f5f2ff',
    paddingVertical: 64,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e4d8ff',
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#2d1b69',
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 18,
    color: '#6b5ca5',
    textAlign: 'center',
    marginTop: 12,
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginHorizontal: -8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#d7c7ff',
    padding: 24,
    margin: 8,
    shadowColor: '#56319a',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 5,
  },
  cardWeb: {
    flexBasis: '22%',
    minWidth: 240,
    maxWidth: '23%',
  },
  cardMobile: {
    width: '100%',
  },
  cardIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  cardIcon: {
    fontSize: 26,
    color: '#ffffff',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d1b69',
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 16,
    color: '#6b5ca5',
    lineHeight: 22,
  },
  sectionTimeline: {
    paddingVertical: 64,
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
  },
  timelineTitle: {
    color: '#2d1b69',
  },
  timelineSubtitle: {
    color: '#6b5ca5',
  },
  timelineContainer: {
    flexDirection: 'column',
  },
  timelineContainerHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  timelineCard: {
    backgroundColor: '#f8f5ff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  timelineCardWeb: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 0,
  },
  timelineCardMobile: {
    width: '100%',
  },
  timelineBadge: {
    width: 82,
    height: 82,
    borderRadius: 56,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    position: 'relative',
    shadowColor: '#56319a',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 6,
  },
  timelineIcon: {
    fontSize: 32,
    color: '#ffffff',
  },
  timelineNumber: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  timelineNumberText: {
    fontWeight: '700',
    color: '#7c3aed',
  },
  timelineTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d1b69',
    textAlign: 'center',
    marginBottom: 12,
  },
  timelineDescription: {
    fontSize: 16,
    textAlign: 'center',
    color: '#6b5ca5',
    lineHeight: 22,
  },
  sectionCta: {
    backgroundColor: '#7c3aed',
    paddingVertical: 72,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  ctaDescription: {
    fontSize: 18,
    color: '#ede7ff',
    textAlign: 'center',
    maxWidth: 640,
    lineHeight: 24,
    marginBottom: 32,
  },
  ctaButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 999,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b21a8',
  },
  footer: {
    backgroundColor: '#ffffff',
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderColor: '#e6e1f5',
    flexDirection: 'column',
  },
  footerWeb: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  footerColumn: {
    width: '100%',
    marginBottom: 24,
  },
  footerColumnWeb: {
    width: '30%',
    minWidth: 240,
  },
  footerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#8b5cf6',
    marginBottom: 12,
  },
  footerColumnTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2d1b69',
    marginBottom: 12,
  },
  footerText: {
    fontSize: 16,
    color: '#6b5ca5',
    marginBottom: 8,
  },
  footerLink: {
    paddingVertical: 6,
  },
  footerLinkText: {
    fontSize: 16,
    color: '#7c3aed',
    fontWeight: '600',
  },
});

export default HomeScreen;
