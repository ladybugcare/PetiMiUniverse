import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, Text } from 'react-native';

// Importar logo
const logoSource = require('../assets/just_logo.png');

interface LoadingScreenProps {
  onFinish?: () => void;
  minDisplayTime?: number; // Tempo mínimo de exibição em ms
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  onFinish, 
  minDisplayTime = 2000 
}) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
      if (onFinish) {
        onFinish();
      }
    }, minDisplayTime);

    return () => clearTimeout(timer);
  }, [onFinish, minDisplayTime]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={logoSource}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="PetiVet Logo"
            onError={(error) => {
              console.error('Image load error:', error);
            }}
            onLoad={() => {
              console.log('Logo loaded successfully');
            }}
          />
          <Text style={styles.appName}>PetiVet</Text>
        </View>

        {/* Loading Indicator */}
        <ActivityIndicator 
          size="large" 
          color="#ffffff" 
          style={styles.loader}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#a855f7', // Cor do hero-purple web
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 24,
    opacity: 1,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  loader: {
    marginTop: 24,
  },
});

export default LoadingScreen;

