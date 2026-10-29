import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.for3.threeheroes',
  appName: '25 waves',
  webDir: 'dist',
  backgroundColor: '#1b1330',
  server: {
    // Разрешаем подключение к игровому серверу по ws:// в локальной сети
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    StatusBar: { overlaysWebView: true, style: 'DARK' },
  },
};

export default config;
