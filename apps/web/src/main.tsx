import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.css';

const runtimePlatform = new URLSearchParams(window.location.search).get('platform');
if (runtimePlatform === 'desktop') {
  document.documentElement.dataset['platform'] = 'desktop';
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
