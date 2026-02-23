import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Shield, User as UserIcon, Settings2 } from 'lucide-react';
import { clsx } from 'clsx';
import { getApiUrl } from '../utils/api';

export function AdminMembers() {
  const [users, setUsers] = useState<any[]>([]);
  const { user } = useAppStore();

  useEffect(() => {
    fetch(getApiUrl('/api/users'))
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
      .then(data => {
        if (Array.isArray(data)) setUsers(data);
      })
      .catch(err => console.error('Users fetch failed:', err));
  }, []);

  if (user?.role !== 'Admin') return <div className="p-8 text-center text-zinc-500">Access Denied</div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 bg-black min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold text-white tracking-tight">Members</h2>
        <button className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white transition-colors">
          <Settings2 size={20} />
        </button>
      </div>

      <div className="space-y-4">
        {users.map(u => (
          <div
            key={u.id}
            className={clsx(
              "bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center justify-between transition-all",
              !u.hasPublicTrip && "opacity-50 grayscale"
            )}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <UserIcon className="text-zinc-400" size={20} />
              </div>
              <div>
                <h3 className="text-white font-medium">{u.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Shield size={12} className={u.role === 'Admin' ? 'text-orange-500' : 'text-zinc-500'} />
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{u.role}</span>
                </div>
              </div>
            </div>
            
            <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium uppercase tracking-wider rounded-full transition-colors">
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
