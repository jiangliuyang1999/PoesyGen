import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.css';

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

const root = document.querySelector('#root');
if (root === null) {
  throw new Error('Root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
