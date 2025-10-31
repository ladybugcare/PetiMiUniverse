import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import ClinicSignUpScreen from '../screens/ClinicSignUpScreen';
import VetSignUpScreen from '../screens/VetSignUpScreen';
import DemandsScreen from '../screens/DemandsScreen';
import LoginScreen from '../screens/LoginScreen';
import ConfirmEmailScreen from '../screens/ConfirmEmailScreen';
import OnboardingStartScreen from '../screens/OnboardingStartScreen';

export type RootStackParamList = {
  Home: undefined;
  ClinicSignup: undefined;
  VetSignup: undefined;
  Demands: undefined;
  Login: undefined;
  Confirm: undefined;
  OnboardingStart: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerShown: false,
  contentStyle: {
    backgroundColor: '#a855f7', // Cor do hero-purple web
  },
};

const AppNavigator = () => {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={screenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="ClinicSignup" component={ClinicSignUpScreen} />
      <Stack.Screen name="VetSignup" component={VetSignUpScreen} />
      <Stack.Screen name="Demands" component={DemandsScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Confirm" component={ConfirmEmailScreen} />
      <Stack.Screen name="OnboardingStart" component={OnboardingStartScreen} />
    </Stack.Navigator>
  );
};

export default AppNavigator;
