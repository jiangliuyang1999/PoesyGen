import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.poesygen.app',
  appName: 'PoesyGen',
  webDir: '../web/dist',
  backgroundColor: '#eeeae1',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
};

export default config;
