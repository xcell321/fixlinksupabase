import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { appFonts } from './theme';
import AppNavigator from './navigation/AppNavigator';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App(): React.JSX.Element | null {
  const [fontsLoaded] = useFonts(appFonts);

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}
