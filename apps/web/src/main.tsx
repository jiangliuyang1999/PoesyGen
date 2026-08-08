import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.css';
import { logWebEvent } from './web-logger.js';

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
}

const capacitor = (window as typeof window & { Capacitor?: CapacitorBridge }).Capacitor;
const requestedPlatform = new URLSearchParams(window.location.search).get('platform');
const runtimePlatform =
  requestedPlatform ?? (capacitor?.isNativePlatform?.() === true ? 'mobile' : undefined);

if (runtimePlatform === 'desktop' || runtimePlatform === 'mobile') {
  document.documentElement.dataset['platform'] = runtimePlatform;
}

logWebEvent('bootstrap', '应用启动', {
  runtimePlatform: runtimePlatform ?? 'web',
  requestedPlatform,
  nativePlatform: capacitor?.isNativePlatform?.() === true,
  location: window.location.href,
  userAgent: navigator.userAgent,
  language: navigator.language,
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  },
});

const root = document.querySelector('#root');
if (root === null) {
  throw new Error('Root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
