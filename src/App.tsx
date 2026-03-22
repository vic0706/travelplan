import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { TopAppBar } from './components/TopAppBar';
import { OfflineStatusBar } from './components/OfflineStatusBar';
import { LoginModal } from './components/LoginModal';
import { CreateTripModal } from './components/CreateTripModal';
import { Home } from './pages/Home';
import { TripDetails } from './pages/TripDetails';
import { AdminMembers } from './pages/AdminMembers';
import { AdminSettings } from './pages/AdminSettings';

import { useAppStore } from './store';
import { apiFetch, safeJson } from './utils/api';
import { City } from './types';
import { clsx } from 'clsx';

function AppContent() {
  const { 
    isLoginModalOpen, setLoginModalOpen, 
    isCreateTripModalOpen, setCreateTripModalOpen, 
    setCities, _hasHydrated 
  } = useAppStore();

  const location = useLocation();
  const navigate = useNavigate();
  const isTripDetails = location.pathname.startsWith('/trip/');

  useEffect(() => {
    // iOS PWA Height Fix
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

    if (isIOS && isStandalone) {
      const fixHeight = () => {
        const height = window.screen.height;
        document.documentElement.style.height = `${height}px`;
        document.body.style.height = `${height}px`;
      };
      fixHeight();
      window.addEventListener('resize', fixHeight);
      return () => window.removeEventListener('resize', fixHeight);
    }
  }, []);

  useEffect(() => {
    if (!_hasHydrated) return;
    const fetchCities = async () => {
      try {
        const res = await apiFetch('/api/cities');
        if (res.ok) {
          const data = await safeJson<City[]>(res);
          setCities(data);
        }
      } catch (err) {
        console.error('Failed to fetch cities:', err);
      }
    };
    fetchCities();
  }, [_hasHydrated, setCities]);

  return (
    <div className="fixed inset-0 h-[100dvh] w-full flex flex-col bg-black text-zinc-100 font-sans overflow-hidden selection:bg-orange-500/30">
      <OfflineStatusBar />
      {!isTripDetails && <TopAppBar />}
      <main className={clsx(
        "flex-1 overflow-y-auto relative z-10",
        !isTripDetails && "pt-[calc(4rem+env(safe-area-inset-top,0px))]"
      )}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trip/:id" element={<TripDetails />} />
          <Route path="/admin/members" element={<AdminMembers />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Routes>
      </main>
      
      {isLoginModalOpen && (
        <LoginModal onClose={() => setLoginModalOpen(false)} />
      )}
      
      {isCreateTripModalOpen && (
        <CreateTripModal 
          isOpen={isCreateTripModalOpen} 
          onClose={() => setCreateTripModalOpen(false)} 
          onSuccess={(tripId) => {
            setCreateTripModalOpen(false);
            navigate(`/trip/${tripId}`);
          }} 
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}