import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import ClinicSignUpScreen from '../screens/ClinicSignUpScreen';
import VetSignUpScreen from '../screens/VetSignUpScreen';
import DemandsScreen from '../screens/DemandsScreen';
import LoginScreen from '../screens/LoginScreen';

export type RootStackParamList = {
  Home: undefined;
  ClinicSignup: undefined;
  VetSignup: undefined;
  Demands: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerShown: false,
  contentStyle: {
    backgroundColor: '#ffffff',
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
    </Stack.Navigator>
  );
};

export default AppNavigator;
