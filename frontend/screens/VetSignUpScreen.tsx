import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/AppNavigator';
import { vetsApi } from '../src/services/vetsApi';
import EmailStatusModal from '../components/EmailStatusModal';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const initialFormState = {
  name: '',
  crmv: '',
  specialties: '',
  experience: '',
  email: '',
  password: '',
};

const VetSignUpScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [form, setForm] = useState(initialFormState);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  const isSubmitDisabled = useMemo(() => {
    return Object.values(form).some((value) => !value.trim());
  }, [form]);

  const handleChange = (field: keyof typeof initialFormState) => (value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled) {
      Alert.alert('Atenção', 'Preencha todos os campos antes de continuar.');
      return;
    }

    try {
      setLoading(true);
      await vetsApi.create({
        name: form.name,
        crmv: form.crmv,
        specialties: form.specialties
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        experience: form.experience,
        email: form.email,
        password: form.password,
      });
      setModal({
        visible: true,
        title: 'Verifique seu e‑mail',
        message:
          'Enviamos um link de confirmação para o e‑mail informado. Confirme para acessar e iniciar o onboarding.',
      });
      setForm(initialFormState);
    } catch (error: any) {
      setModal({
        visible: true,
        title: 'Não foi possível enviar o e‑mail',
        message: error?.message ?? 'Tente novamente em alguns instantes.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <EmailStatusModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        primaryLabel="Entendi"
        onPrimary={() => setModal((m) => ({ ...m, visible: false }))}
      />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cadastre-se como Veterinário 🩺</Text>
        <Text style={styles.headerSubtitle}>
          Junte-se à nossa rede de profissionais veterinários
        </Text>
      </View>

      <View style={styles.formCard}>
        <View style={styles.formField}>
          <Text style={styles.label}>Nome Completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Dr. João Silva"
            placeholderTextColor="#9ca3af"
            value={form.name}
            onChangeText={handleChange('name')}
            autoCapitalize="words"
          />
        </View>

        <View
          style={[
            styles.formRow,
            Platform.OS === 'web' ? styles.formRowHorizontal : styles.formRowVertical,
          ]}
        >
          <View
            style={[
              styles.formField,
              Platform.OS === 'web' ? styles.formFieldHorizontalLeft : undefined,
            ]}
          >
            <Text style={styles.label}>CRMV</Text>
            <TextInput
              style={styles.input}
              placeholder="12345-SP"
              placeholderTextColor="#9ca3af"
              value={form.crmv}
              onChangeText={handleChange('crmv')}
              autoCapitalize="characters"
            />
          </View>

          <View
            style={[
              styles.formField,
              Platform.OS === 'web' ? styles.formFieldHorizontalRight : undefined,
            ]}
          >
            <Text style={styles.label}>Anos de Experiência</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 5 anos"
              placeholderTextColor="#9ca3af"
              value={form.experience}
              onChangeText={handleChange('experience')}
            />
          </View>
        </View>

        <View style={styles.formField}>
          <Text style={styles.label}>Especialidades</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Cirurgia, Clínica Geral, Cardiologia (separadas por vírgula)"
            placeholderTextColor="#9ca3af"
            value={form.specialties}
            onChangeText={handleChange('specialties')}
            multiline
            numberOfLines={Platform.OS === 'web' ? undefined : 3}
          />
        </View>

        <View
          style={[
            styles.formRow,
            Platform.OS === 'web' ? styles.formRowHorizontal : styles.formRowVertical,
          ]}
        >
          <View
            style={[
              styles.formField,
              Platform.OS === 'web' ? styles.formFieldHorizontalLeft : undefined,
            ]}
          >
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="dr.joao@email.com"
              placeholderTextColor="#9ca3af"
              value={form.email}
              onChangeText={handleChange('email')}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View
            style={[
              styles.formField,
              Platform.OS === 'web' ? styles.formFieldHorizontalRight : undefined,
            ]}
          >
            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              value={form.password}
              onChangeText={handleChange('password')}
              secureTextEntry
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={handleSubmit}
          style={[styles.submitButton, isSubmitDisabled || loading ? styles.submitButtonDisabled : undefined]}
          disabled={isSubmitDisabled || loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>Criar conta de veterinário</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Home')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>← Voltar ao início</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3e8ff',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: 720,
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#2e1065',
    textAlign: 'center',
    marginBottom: 12,
  },
  headerSubtitle: {
    fontSize: 18,
    color: '#6d28d9',
    textAlign: 'center',
  },
  formCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#5b21b6',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 6,
  },
  formRow: {
    width: '100%',
  },
  formRowHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formRowVertical: {
    flexDirection: 'column',
  },
  formField: {
    flex: 1,
    marginBottom: 18,
  },
  formFieldHorizontalLeft: {
    marginRight: 12,
  },
  formFieldHorizontalRight: {
    marginLeft: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4c1d95',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#c4b5fd',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#312e81',
    backgroundColor: '#f5f3ff',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  submitButtonDisabled: {
    backgroundColor: '#a78bfa',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d6bcfa',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4c1d95',
  },
});

export default VetSignUpScreen;
