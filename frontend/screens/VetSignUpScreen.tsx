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
import { validateCPF, validateCNPJ, formatCPF, formatCNPJ } from '../src/utils/validators';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const initialFormState = {
  name: '',
  crmv: '',
  document_type: '' as 'CPF' | 'CNPJ' | '',
  document_number: '',
  address: '',
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
    const hasAllFields = form.name.trim() && 
                        form.crmv.trim() && 
                        (form.document_type === 'CPF' || form.document_type === 'CNPJ') &&
                        form.document_number.trim() &&
                        form.address.trim() &&
                        form.email.trim() &&
                        form.password.trim();
    
    // Validar documento
    let documentValid = false;
    if (form.document_type === 'CPF') {
      documentValid = validateCPF(form.document_number);
    } else if (form.document_type === 'CNPJ') {
      documentValid = validateCNPJ(form.document_number);
    }
    
    return !hasAllFields || !documentValid;
  }, [form]);

  const handleChange = (field: keyof typeof initialFormState) => (value: string) => {
    // Se mudar o tipo de documento, limpa o número do documento
    if (field === 'document_type') {
      setForm((current) => ({
        ...current,
        document_type: value as 'CPF' | 'CNPJ',
        document_number: '',
      }));
      return;
    }

    // Aplicar máscara para número do documento
    if (field === 'document_number') {
      let formattedValue = value;
      if (form.document_type === 'CPF') {
        formattedValue = formatCPF(value);
      } else if (form.document_type === 'CNPJ') {
        formattedValue = formatCNPJ(value);
      }
      setForm((current) => ({
        ...current,
        [field]: formattedValue,
      }));
    } else {
      setForm((current) => ({
        ...current,
        [field]: value,
      }));
    }
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled) {
      Alert.alert('Atenção', 'Preencha todos os campos antes de continuar.');
      return;
    }

    try {
      setLoading(true);
      await vetsApi.create({
        name: form.name.trim(),
        crmv: form.crmv.trim(),
        document_type: form.document_type as 'CPF' | 'CNPJ',
        document_number: form.document_number,
        address: form.address.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setModal({
        visible: true,
        title: 'Verifique seu e‑mail',
        message:
          'Enviamos um e-mail de confirmação para o endereço que você cadastrou.\n\n' +
          'É só abrir sua caixa de entrada e seguir as instruções para ativar sua conta PetMi Vet.\n\n' +
          'Você pode fechar esta aba — o restante do processo é feito por e-mail.',
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
        primaryLabel="Fechar"
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

        <View style={styles.formField}>
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

        <View style={styles.formField}>
          <Text style={styles.label}>Tipo de Documento</Text>
          <View style={styles.documentTypeContainer}>
            <Pressable
              style={[
                styles.documentTypeButton,
                form.document_type === 'CPF' && styles.documentTypeButtonActive,
              ]}
              onPress={() => handleChange('document_type')('CPF')}
            >
              <Text
                style={[
                  styles.documentTypeButtonText,
                  form.document_type === 'CPF' && styles.documentTypeButtonTextActive,
                ]}
              >
                CPF
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.documentTypeButton,
                form.document_type === 'CNPJ' && styles.documentTypeButtonActive,
              ]}
              onPress={() => handleChange('document_type')('CNPJ')}
            >
              <Text
                style={[
                  styles.documentTypeButtonText,
                  form.document_type === 'CNPJ' && styles.documentTypeButtonTextActive,
                ]}
              >
                CNPJ
              </Text>
            </Pressable>
          </View>
        </View>

        {form.document_type && (
          <View style={styles.formField}>
            <Text style={styles.label}>Número do {form.document_type}</Text>
            <TextInput
              style={styles.input}
              placeholder={form.document_type === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
              placeholderTextColor="#9ca3af"
              value={form.document_number}
              onChangeText={handleChange('document_number')}
              keyboardType="numeric"
              maxLength={form.document_type === 'CPF' ? 14 : 18}
            />
          </View>
        )}

        <View style={styles.formField}>
          <Text style={styles.label}>Endereço</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Rua, número, bairro, cidade, estado, CEP"
            placeholderTextColor="#9ca3af"
            value={form.address}
            onChangeText={handleChange('address')}
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
  documentTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  documentTypeButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c4b5fd',
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
  },
  documentTypeButtonActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  documentTypeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4c1d95',
  },
  documentTypeButtonTextActive: {
    color: '#ffffff',
  },
});

export default VetSignUpScreen;
