import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { LoginModal } from './LoginModal';
import { LogOut, LogIn, ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppSetting } from '../types';

import { getApiUrl } from '../utils/api';

export function TopAppBar() {
  const [bgUrl, setBgUrl] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const { user, logout } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetch(getApiUrl('/api/settings'))
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('API returned non-JSON:', text.substring(0, 100));
          throw new Error('API returned non-JSON response (likely HTML)');
        }
      })
      .then((data) => {
        if (Array.isArray(data)) {
          const bgSetting = data.find((s: any) => s.key_name === 'top_bar_bg');
          if (bgSetting) setBgUrl(bgSetting.value);
        }
      })
      .catch(err => console.error('Settings fetch failed:', err));
  }, []);

  const isHome = location.pathname === '/';
  const title = isHome ? 'Travel Plan' : 'Trip Details';

  return (
    <>
      <header className="relative h-20 w-full flex items-center justify-between px-4 z-40 bg-black border-b border-orange-500/20">
        {bgUrl && (
          <div className="absolute inset-0 z-[-1] overflow-hidden">
            <img src={bgUrl} alt="Header Background" className="w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black"></div>
          </div>
        )}
        
        <div className="flex items-center gap-3">
          {!isHome && (
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-zinc-300 hover:text-white rounded-full">
              <ChevronLeft size={24} />
            </button>
          )}
          <h1 className="text-2xl font-black tracking-tighter italic">
            <span className="text-orange-500">TRAVEL</span>
            <span className="text-white ml-1">PLAN</span>
          </h1>
        </div>

        <div>
          {user ? (
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500 hover:bg-orange-600 text-sm font-medium text-white transition-colors"
            >
              <LogIn size={16} />
              <span>Login</span>
            </button>
          )}
        </div>
      </header>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
