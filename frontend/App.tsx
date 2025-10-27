import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { StatusBar } from 'react-native';

import AppNavigator, { RootStackParamList } from './navigation/AppNavigator';

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
    background: '#ffffff',
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking} theme={navigationTheme}>
        <StatusBar barStyle="light-content" />
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
