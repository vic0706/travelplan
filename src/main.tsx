import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Polyfill for matchMedia (fixes 'addListener' error in some environments)
if (typeof window !== 'undefined') {
  const originalMatchMedia = window.matchMedia;
  
  let isBroken = false;
  try {
    if (!originalMatchMedia || !originalMatchMedia('all')) {
      isBroken = true;
    }
  } catch (e) {
    isBroken = true;
  }

  if (isBroken) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
}

// ✅ 修正：不再每次啟動都強制 unregister 所有 SW
// 舊做法會讓 PWA 離線功能完全失效，因為每次刷新都清掉 cache
//
// 新策略：用版本號比對，只有在 app 版本升級時才清除舊 cache
// 將版本號改為目前的部署版本（每次 deploy 時更新這個值）
const APP_VERSION = __APP_BUILD_TIME__;
const STORAGE_KEY = 'app_sw_version';

if ('serviceWorker' in navigator) {
  const lastVersion = localStorage.getItem(STORAGE_KEY);

  if (lastVersion !== APP_VERSION) {
    // 版本變了 → 清除舊 SW cache，讓新版 SW 接管
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        console.log('[SW] Version changed, unregistering old SW:', registration.scope);
        registration.unregister();
      }
    });
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
  }
  // 版本相同 → 什麼都不做，SW 正常運作，離線功能完整保留
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);