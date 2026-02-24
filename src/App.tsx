import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { TopAppBar } from './components/TopAppBar';
import { OfflineStatusBar } from './components/OfflineStatusBar';
import { LoginModal } from './components/LoginModal';
import { CreateTripModal } from './components/CreateTripModal';
import { Home } from './pages/Home';
import { TripDetails } from './pages/TripDetails';
import { AdminMembers } from './pages/AdminMembers';
import { AdminSettings } from './pages/AdminSettings';
import { useAppStore } from './store';
import { apiFetch } from './utils/api';
import { City } from './types';
import { clsx } from 'clsx';

function AppContent() {
  const { isLoginModalOpen, setLoginModalOpen, isCreateTripModalOpen, setCreateTripModalOpen, setCities, _hasHydrated, token } = useAppStore();
  const location = useLocation();
  const isTripDetails = location.pathname.startsWith('/trip/');

  useEffect(() => {
    if (!_hasHydrated || !token) return;
    const fetchCities = async () => {
      try {
        const res = await apiFetch('/api/cities');
        if (res.ok) {
          const data = await res.json() as City[];
          setCities(data);
        }
      } catch (err) {
        console.error('Failed to fetch cities:', err);
      }
    };
    fetchCities();
  }, [_hasHydrated, setCities]);

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-black text-zinc-100 font-sans overflow-hidden selection:bg-orange-500/30">
      <OfflineStatusBar />
      {!isTripDetails && <TopAppBar />}
      <main className={clsx(
        "flex-1 overflow-y-auto relative z-10",
        !isTripDetails && "pt-[calc(4rem+env(safe-area-inset-top))]"
      )}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trip/:id" element={<TripDetails />} />
          <Route path="/admin/members" element={<AdminMembers />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Routes>
      </main>
      
      {/* Global Modals */}
      {isLoginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
      {isCreateTripModalOpen && <CreateTripModal />}
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
