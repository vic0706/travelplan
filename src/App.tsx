import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TopAppBar } from './components/TopAppBar';
import { OfflineStatusBar } from './components/OfflineStatusBar';
import { LoginModal } from './components/LoginModal';
import { CreateTripModal } from './components/CreateTripModal';
import { Home } from './pages/Home';
import { TripDetails } from './pages/TripDetails';
import { AdminMembers } from './pages/AdminMembers';
import { AdminSettings } from './pages/AdminSettings';
import { useAppStore } from './store';

export default function App() {
  const { isLoginModalOpen, setLoginModalOpen, isCreateTripModalOpen, setCreateTripModalOpen } = useAppStore();

  return (
    <Router>
      <div className="flex flex-col h-[100dvh] w-screen bg-black text-zinc-100 font-sans overflow-hidden selection:bg-orange-500/30">
        <OfflineStatusBar />
        <TopAppBar />
        <main className="flex-1 overflow-y-auto relative z-10 pt-16"> {/* Added pt-16 for TopAppBar */}
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
    </Router>
  );
}
