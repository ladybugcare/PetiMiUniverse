import React from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const OnboardingStartScreen = () => {
  const openWebFlow = () => {
    const url = `${FRONTEND_URL}`
    Linking.openURL(url).catch(() => {})
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vamos criar sua primeira unidade</Text>
      <Text style={styles.text}>
        Para começar, você pode seguir o fluxo guiado. Em breve este passo estará 100% no app.
      </Text>
      <View style={{ height: 16 }} />
      <Pressable accessibilityRole="button" onPress={openWebFlow} style={styles.primary}>
        <Text style={styles.primaryText}>Abrir fluxo de onboarding (versão web)</Text>
      </Pressable>
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
    textAlign: 'center',
  },
  text: {
    color: '#374151',
    textAlign: 'center',
  },
  primary: {
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
  },
})

export default OnboardingStartScreen


