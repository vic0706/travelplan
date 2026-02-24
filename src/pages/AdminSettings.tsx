import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Save, Database, Loader2 } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { db } from '../db';

export function AdminSettings() {
  const { user } = useAppStore();
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (err) {
      console.error(err);
      setMessage('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    if (window.confirm('This will clear all local data and reload. Are you sure?')) {
      localStorage.clear();
      sessionStorage.clear();
      await db.delete();
      window.location.reload();
    }
  };

  if (user?.role !== 'Admin') return <div className="p-8 text-center text-zinc-500">Access Denied</div>;

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-orange-500" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 bg-black min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold text-white tracking-tight">Settings</h2>
        <div className="flex gap-2">
            <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-xs font-bold uppercase tracking-wider rounded-full hover:bg-orange-600 transition-all disabled:opacity-50"
            >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-sm font-bold text-center mb-4 ${message.includes('Error') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
          {message}
        </div>
      )}

      <div className="space-y-6">
        {/* System Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500 px-2">
            <Database size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">System</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">App Name</label>
              <input 
                type="text" 
                value={settings.app_name || ''} 
                onChange={e => setSettings({...settings, app_name: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Travel Plan"
              />
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <button 
                onClick={handleClearCache}
                className="w-full py-3 bg-red-500/10 text-red-500 text-xs font-bold uppercase tracking-wider rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
              >
                Clear Cache & Re-sync Database
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
