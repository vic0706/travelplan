import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Settings, Users, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function TopAppBar() {
  const { user, isUserMenuOpen, setLoginModalOpen, setUserMenuOpen, logout, setCreateTripModalOpen } = useAppStore();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen, setUserMenuOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black border-b border-zinc-800 h-16 px-4 flex items-center justify-between">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
        <h1 className="text-xl font-black tracking-tighter text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)] italic hover:scale-105 transition-transform">
          TRAVEL PLAN
        </h1>
      </div>

      <div className="relative" ref={menuRef}>
        {user ? (
          <button
            onClick={() => setUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 p-1 pr-3 rounded-full hover:bg-zinc-900 transition-colors border border-transparent hover:border-orange-500/30"
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover border border-orange-500/50"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-orange-500">
                <User size={16} />
              </div>
            )}
            <span className="text-sm font-bold text-zinc-100 hidden sm:block">{user.name}</span>
          </button>
        ) : (
          <button
            onClick={() => setLoginModalOpen(true)}
            className="px-5 py-2 bg-orange-500 text-white text-sm font-bold rounded-full hover:bg-orange-600 transition-all shadow-[0_0_15px_rgba(249,115,22,0.3)] active:scale-95"
          >
            Sign In
          </button>
        )}

        {/* User Menu Dropdown */}
        <AnimatePresence>
          {isUserMenuOpen && user && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden origin-top-right z-50"
            >
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                <p className="text-sm font-bold text-white">{user.name}</p>
                <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest mt-0.5">{user.role}</p>
              </div>
              <div className="p-1 space-y-0.5">
                {user.role === 'Admin' && (
                  <>
                    <button 
                      onClick={() => {
                        setCreateTripModalOpen(true);
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                    >
                      <Plus size={16} className="text-orange-500" />
                      New Trip
                    </button>
                    <button 
                      onClick={() => {
                        navigate('/admin/members');
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                    >
                      <Users size={16} />
                      Members
                    </button>
                  </>
                )}
                <button 
                  onClick={() => {
                    navigate('/admin/settings');
                    setUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                >
                  <Settings size={16} />
                  Settings
                </button>
                <div className="h-px bg-zinc-800 my-1 mx-2"></div>
                <button
                  onClick={() => {
                    logout();
                    setUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-left font-medium"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
