import React from 'react';
import { useAppStore } from '../store';
import { Users, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

export function AdminBottomBar() {
  const { user } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (user?.role !== 'Admin') return null;

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-around px-4 pb-[env(safe-area-inset-bottom)] z-50">
      <button
        onClick={() => navigate('/admin/members')}
        className={clsx(
          "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
          isActive('/admin/members') ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <Users size={24} />
        <span className="text-[10px] font-medium uppercase tracking-wider">Members</span>
      </button>
      <button
        onClick={() => navigate('/admin/settings')}
        className={clsx(
          "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
          isActive('/admin/settings') ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <Settings size={24} />
        <span className="text-[10px] font-medium uppercase tracking-wider">Settings</span>
      </button>
    </div>
  );
}
