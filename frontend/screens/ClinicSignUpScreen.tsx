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
import { clinicsApi } from '../src/services/clinicsApi';
import EmailStatusModal from '../components/EmailStatusModal';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const initialFormValues = {
  name: '',
  cnpj: '',
  address: '',
  email: '',
  password: '',
};

const ClinicSignUpScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [form, setForm] = useState(initialFormValues);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  const isSubmittingDisabled = useMemo(() => {
    return Object.values(form).some((value) => !value.trim());
  }, [form]);

  const handleChange = (field: keyof typeof initialFormValues) => (value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    if (isSubmittingDisabled) {
      Alert.alert('Atenção', 'Por favor, preencha todos os campos antes de continuar.');
      return;
    }

    try {
      setLoading(true);
      const result = await clinicsApi.create(form);
      setModal({
        visible: true,
        title: 'Verifique seu e‑mail',
        message:
          'Enviamos um e-mail de confirmação para o endereço que você cadastrou.\n\n' +
          'É só abrir sua caixa de entrada e seguir as instruções para ativar sua conta PetiVet.\n\n' +
          'Você pode fechar esta aba — o restante do processo é feito por e-mail.',
      });
      setForm(initialFormValues);
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
        primaryLabel="Fechar"
        onPrimary={() => setModal((m) => ({ ...m, visible: false }))}
      />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cadastre sua Clínica 🏥</Text>
        <Text style={styles.headerSubtitle}>
          Junte-se à nossa rede de clínicas veterinárias
        </Text>
      </View>

      <View style={styles.formCard}>
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
            <Text style={styles.label}>Nome da Clínica</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Clínica Veterinária PetCare"
              placeholderTextColor="#9ca3af"
              value={form.name}
              onChangeText={handleChange('name')}
              autoCapitalize="words"
            />
          </View>

          <View
            style={[
              styles.formField,
              Platform.OS === 'web' ? styles.formFieldHorizontalRight : undefined,
            ]}
          >
            <Text style={styles.label}>CNPJ</Text>
            <TextInput
              style={styles.input}
              placeholder="00.000.000/0000-00"
              placeholderTextColor="#9ca3af"
              value={form.cnpj}
              onChangeText={handleChange('cnpj')}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <View style={styles.formField}>
          <Text style={styles.label}>Endereço Completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Rua, número, bairro, cidade - UF"
            placeholderTextColor="#9ca3af"
            value={form.address}
            onChangeText={handleChange('address')}
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
              placeholder="contato@clinica.com"
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
          style={[styles.submitButton, isSubmittingDisabled || loading ? styles.submitButtonDisabled : undefined]}
          disabled={isSubmittingDisabled || loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>Criar conta da clínica</Text>
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
    backgroundColor: '#ede9fe',
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
    color: '#312e81',
    textAlign: 'center',
    marginBottom: 12,
  },
  headerSubtitle: {
    fontSize: 18,
    color: '#4c1d95',
    textAlign: 'center',
  },
  formCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#4c1d95',
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
    borderColor: '#d8b4fe',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#312e81',
    backgroundColor: '#f9f5ff',
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

export default ClinicSignUpScreen;
