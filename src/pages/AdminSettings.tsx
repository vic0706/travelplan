import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Save, Globe, Bell, Shield, Database } from 'lucide-react';
import { getApiUrl } from '../utils/api';

export function AdminSettings() {
  const { user } = useAppStore();
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(getApiUrl('/api/settings'))
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch settings:', err);
        setLoading(false);
      });
  }, []);

  if (user?.role !== 'Admin') return <div className="p-8 text-center text-zinc-500">Access Denied</div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 bg-black min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold text-white tracking-tight">Settings</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-xs font-bold uppercase tracking-wider rounded-full hover:bg-orange-600 transition-all">
          <Save size={16} />
          Save Changes
        </button>
      </div>

      <div className="space-y-6">
        {/* System Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500 px-2">
            <Database size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">System</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <button className="w-full py-3 bg-red-500/10 text-red-500 text-xs font-bold uppercase tracking-wider rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">
              Clear Cache & Re-sync Database
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
