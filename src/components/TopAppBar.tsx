import React from 'react';
import { useAppStore } from '../store';
import { User, LogOut, Settings, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function TopAppBar() {
  const { user, isUserMenuOpen, setLoginModalOpen, setUserMenuOpen, logout } = useAppStore();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-b border-zinc-200 h-16 px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold">
          TP
        </div>
        <h1 className="text-lg font-semibold text-zinc-900">Travel Plan</h1>
      </div>

      <div className="relative">
        {user ? (
          <button
            onClick={() => setUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 p-1 pr-3 rounded-full hover:bg-zinc-100 transition-colors"
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover border border-zinc-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500">
                <User size={16} />
              </div>
            )}
            <span className="text-sm font-medium text-zinc-700 hidden sm:block">{user.name}</span>
          </button>
        ) : (
          <button
            onClick={() => setLoginModalOpen(true)}
            className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-full hover:bg-zinc-800 transition-colors"
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
              className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-zinc-100 overflow-hidden origin-top-right"
            >
              <div className="p-4 border-b border-zinc-100">
                <p className="text-sm font-medium text-zinc-900">{user.name}</p>
                <p className="text-xs text-zinc-500 capitalize">{user.role}</p>
              </div>
              <div className="p-1">
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors text-left">
                  <Settings size={16} />
                  Settings
                </button>
                <button
                  onClick={() => {
                    logout();
                    setUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
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
