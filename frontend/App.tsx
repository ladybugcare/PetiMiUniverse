import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { StatusBar } from 'react-native';

import AppNavigator, { RootStackParamList } from './navigation/AppNavigator';
import { enforceAuthEnvConsistency } from './src/services/authEnvGuard';

const linking = {
  prefixes: [Linking.createURL('/')],
  config: {
    screens: {
      Home: '',
      ClinicSignup: 'clinic-signup',
      VetSignup: 'vet-signup',
      Demands: 'demands',
      Login: 'login',
    } satisfies Record<keyof RootStackParamList, string | { path: string }>,
  },
};

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#a855f7', // Cor do hero-purple web
  },
};

export default function App() {
  useEffect(() => {
    enforceAuthEnvConsistency();
  }, []);
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking} theme={navigationTheme}>
        <StatusBar barStyle="light-content" />
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
