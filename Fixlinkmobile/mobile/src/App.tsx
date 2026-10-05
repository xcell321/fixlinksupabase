import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { appFonts } from './theme';
import AppNavigator from './navigation/AppNavigator';
import { Inspector } from 'react-native-dev-inspector';
import './setupLocator';

// Web only: hide the browser's default focus outline/rectangle on inputs so
// tapping a field shows only the blinking text caret, no border highlight.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleTag = document.createElement('style');
  styleTag.id = 'fixlink-focus-style';
  styleTag.textContent = 'input:focus{outline:none;box-shadow:none;} textarea:focus{outline:none;box-shadow:none;} [contenteditable]:focus{outline:none;}';
  document.head.appendChild(styleTag);
}

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
    <Inspector disabled={!__DEV__ || Platform.OS === 'web'} editor="code">
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </Inspector>
  );
}
