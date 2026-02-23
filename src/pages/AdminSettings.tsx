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
        {/* General Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500 px-2">
            <Globe size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">General</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">Application Name</h4>
                <p className="text-xs text-zinc-500 mt-1">Displayed in title bar and emails</p>
              </div>
              <input 
                type="text" 
                value={settings.app_name || 'Travel Plan'} 
                className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">Default Currency</h4>
                <p className="text-xs text-zinc-500 mt-1">Used for new trip expenses</p>
              </div>
              <select className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500">
                <option>TWD</option>
                <option>USD</option>
                <option>JPY</option>
                <option>EUR</option>
              </select>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500 px-2">
            <Shield size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Security</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">Allow Public Registration</h4>
                <p className="text-xs text-zinc-500 mt-1">Enable new users to sign up</p>
              </div>
              <div className="w-12 h-6 bg-zinc-800 rounded-full relative">
                <div className="absolute left-1 top-1 w-4 h-4 bg-zinc-600 rounded-full"></div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">Maintenance Mode</h4>
                <p className="text-xs text-zinc-500 mt-1">Disable all non-admin access</p>
              </div>
              <div className="w-12 h-6 bg-zinc-800 rounded-full relative">
                <div className="absolute left-1 top-1 w-4 h-4 bg-zinc-600 rounded-full"></div>
              </div>
            </div>
          </div>
        </section>

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
