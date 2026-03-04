import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Polyfill for matchMedia (fixes 'addListener' error in some environments)
if (typeof window !== 'undefined') {
  const originalMatchMedia = window.matchMedia;
  
  // Check if matchMedia is missing or broken (returns undefined or non-object)
  let isBroken = false;
  try {
    if (!originalMatchMedia || !originalMatchMedia('all')) {
      isBroken = true;
    }
  } catch (e) {
    isBroken = true;
  }

  if (isBroken) {
    // Define a robust mock
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {}, // Deprecated
      removeListener: () => {}, // Deprecated
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
}

// Force unregister all service workers to clear old caches (e.g. 'TripMoney')
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      console.log('Unregistering Service Worker to clear cache:', registration);
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
