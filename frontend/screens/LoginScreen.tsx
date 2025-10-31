import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/AppNavigator';
import { login } from '../src/services/api';
import EmailStatusModal from '../components/EmailStatusModal';
import { supabase } from '../src/services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const LoginScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<
    | { type: 'none' }
    | { type: 'unconfirmed'; email: string; message: string }
    | { type: 'info'; title: string; message: string }
  >({ type: 'none' });

  const isDisabled = useMemo(() => !email.trim() || !password.trim(), [email, password]);

  const handleSubmit = async () => {
    if (isDisabled) {
      Alert.alert('Atenção', 'Informe email e senha para continuar.');
      return;
    }

    try {
      setLoading(true);
      await login({ email, password });
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.toLowerCase().includes('confirm') || message.toLowerCase().includes('email not confirmed')) {
        setModal({ type: 'unconfirmed', email, message: 'Você precisa confirmar seu e‑mail para acessar. Quer reenviar o e‑mail de confirmação?' })
      } else {
        setModal({ type: 'info', title: 'Erro no login', message: message || 'Tente novamente em instantes.' })
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (modal.type !== 'unconfirmed') return
    setLoading(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: modal.email })
      if (error) {
        setModal({ type: 'info', title: 'Falha ao reenviar', message: error.message })
      } else {
        setModal({ type: 'info', title: 'E‑mail reenviado', message: 'Se o e‑mail existir e não estiver confirmado, você receberá um novo link.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {modal.type === 'unconfirmed' ? (
        <EmailStatusModal
          visible
          title="Confirme seu e‑mail"
          message={modal.message}
          primaryLabel="Reenviar"
          secondaryLabel="Fechar"
          onPrimary={handleResend}
          onSecondary={() => setModal({ type: 'none' })}
        />
      ) : null}
      {modal.type === 'info' ? (
        <EmailStatusModal
          visible
          title={modal.title}
          message={modal.message}
          primaryLabel="Ok"
          onPrimary={() => setModal({ type: 'none' })}
        />
      ) : null}
      <View style={styles.formCard}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Bem-vindo de volta</Text>
          <Text style={styles.headerSubtitle}>Faça login na sua conta PetiVet</Text>
        </View>

        <View style={styles.formField}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.formField}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={handleSubmit}
          style={[styles.submitButton, isDisabled || loading ? styles.submitButtonDisabled : undefined]}
          disabled={isDisabled || loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>Entrar</Text>
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
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  formCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#4c1d95',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 6,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  formField: {
    marginBottom: 18,
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

export default LoginScreen;
