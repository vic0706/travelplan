import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { LoginModal } from './LoginModal';
import { LogOut, LogIn, ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppSetting } from '../types';

export function TopAppBar() {
  const [bgUrl, setBgUrl] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const { user, logout } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then((data: AppSetting[]) => {
        const bgSetting = data.find(s => s.key_name === 'top_bar_bg');
        if (bgSetting) setBgUrl(bgSetting.value);
      });
  }, []);

  const isHome = location.pathname === '/';
  const title = isHome ? 'Travel Tracker' : 'Trip Details'; // Can be dynamic based on route

  return (
    <>
      <header className="relative h-20 w-full flex items-center justify-between px-4 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-white/5">
        {bgUrl && (
          <div className="absolute inset-0 z-[-1] overflow-hidden">
            <img src={bgUrl} alt="Header Background" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-950"></div>
          </div>
        )}
        
        <div className="flex items-center gap-3">
          {!isHome && (
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-zinc-300 hover:text-white rounded-full">
              <ChevronLeft size={24} />
            </button>
          )}
          <h1 className="text-xl font-semibold text-white tracking-tight">{title}</h1>
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
