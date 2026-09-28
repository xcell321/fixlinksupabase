// API base-URL auto-detection. No manual .env editing is needed.
// The Metro dev server (metro.config.js) proxies /api plus /uploads to the
// backend (port 5050), so the app calls its OWN origin:
//   Web (browser):     same origin the page loads from
//   Native (Expo Go):  the host that serves the JS bundle
// Manual override (highest priority): EXPO_PUBLIC_API_URL in mobile/.env.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const envApiUrl = process.env.EXPO_PUBLIC_API_URL;

const readHostUri = (): string => {
  const config = (Constants.expoConfig ?? {}) as {
    hostUri?: string;
    extra?: { hostUri?: string };
  };
  const manifest = (Constants as unknown as {
    manifest?: { hostUri?: string; debuggerHost?: string };
    manifest2?: { extra?: { expoGo?: { developer?: { host?: string } } } };
  }).manifest;
  const manifest2 = (Constants as unknown as {
    manifest2?: { extra?: { expoGo?: { developer?: { projectRoot?: string; host?: string } } } };
  }).manifest2;
  return String(
    config.hostUri ??
      config.extra?.hostUri ??
      manifest?.hostUri ??
      manifest?.debuggerHost ??
      manifest2?.extra?.expoGo?.developer?.host ??
      '',
  );
};

const stripScheme = (value: string): string => {
  const noScheme = String(value ?? '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const noPath = String(noScheme.split('/')[0] ?? noScheme);
  const noQuery = String(noPath.split('?')[0] ?? noPath);
  return noQuery.trim();
};

const isTunnelHost = (host: string): boolean =>
  /(trycloudflare\.com|cfargotunnel\.com|ngrok\.io|ngrok-free\.app|ngrok\.app|loca\.lt|serveo\.net)$/i.test(
    String(host ?? '').trim(),
  );

const isLoopbackHost = (host: string): boolean => {
  const normalized = String(host ?? '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
};

const resolveNativeApiUrl = (): string => {
  const rawHostUri = stripScheme(readHostUri());
  const [rawHost, rawPort] = rawHostUri.split(':');
  const bundleHost = String(rawHost ?? '').trim() || 'localhost';
  const bundlePort = String(rawPort ?? '').trim();

  if (isTunnelHost(bundleHost)) {
    return `https://${bundleHost}/api`;
  }

  if (isLoopbackHost(bundleHost)) {
    const port = /^\d+$/.test(bundlePort) ? bundlePort : '8081';
    if (Platform.OS === 'android') {
      return `http://10.0.2.2:${port}/api`;
    }
    return `http://${bundleHost}:${port}/api`;
  }

  const port = /^\d+$/.test(bundlePort) ? bundlePort : '8081';
  return `http://${bundleHost}:${port}/api`;
};

const resolveWebApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api`;
  }
  return resolveNativeApiUrl();
};

export const API_BASE_URL: string =
  envApiUrl && envApiUrl.trim() !== '' ? envApiUrl.trim().replace(/\/$/, '') : Platform.OS === 'web' ? resolveWebApiUrl() : resolveNativeApiUrl();

export const getApiBaseUrl = (): string => API_BASE_URL;
