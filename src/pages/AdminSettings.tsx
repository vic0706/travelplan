import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Save, Database, Loader2, Plus, Trash2, Tag } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { apiFetch } from '../utils/api';
import { db } from '../db';

const DynamicIcon = ({ name, className, size = 16 }: { name: string, className?: string, size?: number }) => {
  const iconName = name.charAt(0).toUpperCase() + name.slice(1);
  const Icon = (LucideIcons as any)[iconName] || (LucideIcons as any)[name] || LucideIcons.Circle;
  return <Icon className={className} size={size} />;
};

export function AdminSettings() {
  const { user } = useAppStore();
  const [settings, setSettings] = useState<any>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  const [newCat, setNewCat] = useState({ name: '', icon: 'Circle', color: '#808080' });
  const [addingCat, setAddingCat] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [settingsRes, catsRes] = await Promise.all([
          apiFetch('/api/settings'),
          apiFetch('/api/settings/categories')
        ]);
        
        if (settingsRes.ok) {
          setSettings(await settingsRes.json());
        }
        if (catsRes.ok) {
          setCategories(await catsRes.json());
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
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

  const handleAddCategory = async () => {
    if (!newCat.name) return;
    setAddingCat(true);
    try {
      const res = await apiFetch('/api/settings/categories', {
        method: 'POST',
        body: JSON.stringify(newCat)
      });
      if (res.ok) {
        const catsRes = await apiFetch('/api/settings/categories');
        setCategories(await catsRes.json());
        setNewCat({ name: '', icon: 'Circle', color: '#808080' });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add category');
    } finally {
      setAddingCat(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Delete this category?')) return;
    try {
      const res = await apiFetch(`/api/settings/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const catsRes = await apiFetch('/api/settings/categories');
        setCategories(await catsRes.json());
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete category');
    }
  };

  const handleClearCache = async () => {
    if (window.confirm('This will clear all local data and reload. Are you sure?')) {
      localStorage.clear();
      sessionStorage.clear();
      // await db.delete(); // db might not be initialized if imported directly, safer to just clear storage and reload
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

      <div className="space-y-8">
        {/* Expense Categories Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500 px-2">
            <Tag size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Expense Categories</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl group relative">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: cat.color }}>
                      <DynamicIcon name={cat.icon} size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-white">{cat.name}</p>
                      <p className="text-xs text-zinc-500">{cat.is_default ? 'System Default' : 'Custom'}</p>
                    </div>
                  </div>
                  {!cat.is_default && (
                    <button 
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="absolute right-2 top-2 p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <h4 className="text-sm font-medium text-zinc-400 mb-4">Add New Category</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="flex-1 w-full">
                  <label className="text-xs text-zinc-500 mb-1 block">Name</label>
                  <input 
                    type="text" 
                    value={newCat.name}
                    onChange={e => setNewCat({...newCat, name: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    placeholder="e.g. Snacks"
                  />
                </div>
                <div className="flex-1 w-full">
                  <label className="text-xs text-zinc-500 mb-1 block">Icon (Lucide Name)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={newCat.icon}
                      onChange={e => setNewCat({...newCat, icon: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 pr-10"
                      placeholder="e.g. Coffee"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                      <DynamicIcon name={newCat.icon} size={16} />
                    </div>
                  </div>
                </div>
                <div className="w-full md:w-auto">
                  <label className="text-xs text-zinc-500 mb-1 block">Color</label>
                  <div className="flex items-center gap-2 h-[42px] bg-zinc-800 border border-zinc-700 rounded-xl px-2">
                    <input 
                      type="color" 
                      value={newCat.color}
                      onChange={e => setNewCat({...newCat, color: e.target.value})}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
                    />
                    <span className="text-xs text-zinc-500 font-mono">{newCat.color}</span>
                  </div>
                </div>
                <button 
                  onClick={handleAddCategory}
                  disabled={addingCat || !newCat.name}
                  className="w-full md:w-auto px-6 py-2.5 bg-zinc-800 text-white font-bold rounded-xl hover:bg-orange-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 h-[42px]"
                >
                  {addingCat ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Add
                </button>
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

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Top Background Image URL</label>
              <input 
                type="text" 
                value={settings.top_bg_url || ''} 
                onChange={e => setSettings({...settings, top_bg_url: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="https://picsum.photos/..."
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
