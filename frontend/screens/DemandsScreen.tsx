import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/AppNavigator';
import { demandsApi, Demand } from '../src/services/demandsApi';
import { clinicsApi, Clinic } from '../src/services/clinicsApi';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const DemandsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [clinics, setClinics] = useState<Record<string, Clinic>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [demandsResult, clinicsResult] = await Promise.all([
        demandsApi.getOpen(),
        clinicsApi.getAll(),
      ]);

      setDemands(demandsResult.demands ?? []);
      const clinicsMap = (clinicsResult.clinics ?? []).reduce<Record<string, Clinic>>(
        (acc, clinic) => {
          acc[clinic.id] = clinic;
          return acc;
        },
        {}
      );
      setClinics(clinicsMap);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível carregar as demandas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasDemands = useMemo(() => demands.length > 0, [demands]);

  const getClinicName = useCallback(
    (clinicId: string) => clinics[clinicId]?.name ?? 'Clínica não encontrada',
    [clinics]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Demandas Abertas 📋</Text>
        <Text style={styles.headerSubtitle}>
          Encontre oportunidades de trabalho na sua área
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={styles.loadingText}>Carregando demandas...</Text>
        </View>
      ) : !hasDemands ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyStateIcon}>
            <Text style={styles.emptyStateIconText}>📋</Text>
          </View>
          <Text style={styles.emptyStateTitle}>Nenhuma demanda aberta</Text>
          <Text style={styles.emptyStateDescription}>
            No momento não há demandas disponíveis. Volte mais tarde!
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.cardsContainer,
            Platform.OS === 'web' ? styles.cardsContainerWeb : undefined,
          ]}
        >
          {demands.map((demand) => (
            <View
              key={demand.id}
              style={[
                styles.card,
                Platform.OS === 'web' ? styles.cardWeb : styles.cardMobile,
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{demand.title}</Text>
                <View
                  style={[
                    styles.badge,
                    demand.status === 'open' ? styles.badgeSuccess : styles.badgeWarning,
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {demand.status === 'open' ? 'Aberta' : demand.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardDescription}>{demand.description}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.cardClinic}>{getClinicName(demand.clinic_id)}</Text>

                {typeof demand.payment === 'number' && (
                  <Text style={styles.cardPayment}>
                    R$ {demand.payment.toFixed(2)}
                  </Text>
                )}
              </View>

              <View style={styles.cardMeta}>
                <Text style={styles.cardDate}>
                  {new Date(demand.created_at).toLocaleDateString('pt-BR')}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  style={styles.cardButton}
                  onPress={() =>
                    Alert.alert('Em breve', 'A visualização detalhada estará disponível em breve.')
                  }
                >
                  <Text style={styles.cardButtonText}>Ver detalhes</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Home')}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>← Voltar ao início</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f3ff',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: 960,
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#312e81',
    textAlign: 'center',
    marginBottom: 12,
  },
  headerSubtitle: {
    fontSize: 18,
    color: '#4c1d95',
    textAlign: 'center',
  },
  loadingWrapper: {
    marginTop: 48,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b5ca5',
  },
  emptyState: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#5b21b6',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 6,
    marginBottom: 24,
  },
  emptyStateIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateIconText: {
    fontSize: 36,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#312e81',
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 16,
    color: '#6b5ca5',
    textAlign: 'center',
  },
  cardsContainer: {
    width: '100%',
    maxWidth: 960,
  },
  cardsContainerWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#5b21b6',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 5,
    marginBottom: 24,
  },
  cardWeb: {
    width: '31%',
    minWidth: 280,
  },
  cardMobile: {
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#312e81',
    flex: 1,
    marginRight: 12,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b5ca5',
    lineHeight: 20,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardClinic: {
    fontSize: 14,
    color: '#6b5ca5',
  },
  cardPayment: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: 12,
    color: '#a78bfa',
  },
  cardButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cardButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d6bcfa',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 24,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4c1d95',
  },
});

export default DemandsScreen;
