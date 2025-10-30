import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, Pressable, StyleSheet, Linking } from 'react-native'
import { supabase } from '../src/services/supabase'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation/AppNavigator'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

const ConfirmEmailScreen = () => {
  const navigation = useNavigation<NavigationProp>()
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [message, setMessage] = useState('Confirmando seu acesso...')

  useEffect(() => {
    const check = async () => {
      try {
        // Try to exchange the authorization code from the deep link for a session.
        try {
          const url = await Linking.getInitialURL()
          if (url) {
            await supabase.auth.exchangeCodeForSession(url)
          }
        } catch (exchangeErr: any) {
          // Proceed even if there's no URL/code; session might already be valid.
          console.error('Error exchanging code for session (RN):', exchangeErr)
        }

        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (data.session?.user?.email_confirmed_at) {
          setStatus('ok')
          setMessage('E‑mail confirmado com sucesso!')
        } else {
          setStatus('error')
          setMessage('Não foi possível validar sua sessão. Faça login após confirmar o e‑mail.')
        }
      } catch (err: any) {
        setStatus('error')
        setMessage(err?.message || 'Algo deu errado ao confirmar seu e‑mail.')
      }
    }
    check()
  }, [])

  return (
    <View style={styles.container}>
      {status === 'checking' ? (
        <>
          <ActivityIndicator color="#7c3aed" />
          <Text style={styles.text}>{message}</Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>{status === 'ok' ? 'Tudo certo ✨' : 'Ops...'}</Text>
          <Text style={styles.text}>{message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('OnboardingStart')}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Iniciar Onboarding</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  text: {
    marginTop: 12,
    color: '#374151',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
})

export default ConfirmEmailScreen


