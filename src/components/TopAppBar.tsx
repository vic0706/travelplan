import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Users, RefreshCw, User as UserIcon, Plus } from 'lucide-react';
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

  const handleClearCache = () => {
    if (window.confirm('Are you sure you want to clear cache and reload?')) {
      localStorage.clear();
      sessionStorage.clear();
      // Clear IndexedDB if needed, but for now just reload
      window.location.reload();
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 flex items-center justify-between safe-top h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
        <h1 className="text-xl font-black tracking-tighter text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)] italic hover:scale-105 transition-transform">
          TRAVEL PLAN
        </h1>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setUserMenuOpen(!isUserMenuOpen)}
          className="p-2 rounded-full hover:bg-zinc-900 transition-colors text-zinc-400 hover:text-white"
        >
          <Settings size={24} />
        </button>

        {/* User Menu Dropdown */}
        <AnimatePresence>
          {isUserMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden origin-top-right z-50"
            >
              {user ? (
                <>
                  <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-orange-500/50">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-orange-500">
                          <UserIcon size={20} />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{user.name}</p>
                      <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">{user.role}</p>
                    </div>
                  </div>
                  <div className="p-1 space-y-0.5">
                    {user.role === 'Admin' && (
                      <>
                        <button 
                          onClick={() => {
                            setCreateTripModalOpen(true);
                            setUserMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                        >
                          <Plus size={16} />
                          New Trip
                        </button>
                        <button 
                          onClick={() => {
                            navigate('/admin/members');
                            setUserMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                        >
                          <Users size={16} />
                          Member Management
                        </button>
                        <button 
                          onClick={() => {
                            navigate('/admin/settings');
                            setUserMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                        >
                          <Settings size={16} />
                          System Settings
                        </button>
                      </>
                    )}
                    
                    <button 
                      onClick={() => {
                        // Handle change avatar (placeholder for now)
                        alert('Change Avatar feature coming soon!');
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                    >
                      <UserIcon size={16} />
                      Change Avatar
                    </button>

                    <button 
                      onClick={() => {
                        handleClearCache();
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                    >
                      <RefreshCw size={16} />
                      Clear Cache & Reload
                    </button>

                    <div className="h-px bg-zinc-800 my-1 mx-2"></div>
                    <button
                      onClick={() => {
                        logout();
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-left font-medium"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-1 space-y-0.5">
                  <button
                    onClick={() => {
                      setLoginModalOpen(true);
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-colors text-left font-bold justify-center mb-2 shadow-lg shadow-orange-500/20"
                  >
                    Sign In
                  </button>
                  <button 
                    onClick={() => {
                      handleClearCache();
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                  >
                    <RefreshCw size={16} />
                    Clear Cache & Reload
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
