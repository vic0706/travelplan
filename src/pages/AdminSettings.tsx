import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Save, Database, Loader2, Plus, Trash2, Tag, ArrowLeft, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { ImageCropper, uploadImageToSupabase } from '../components/widgets/ImageCropper';
import { motion, AnimatePresence } from 'framer-motion';
import { DynamicIcon } from '../components/common/DynamicIcon';

export function AdminSettings() {
  const { user } = useAppStore();
  const [view, setView] = useState<'main' | 'categories' | 'system'>('main');
  const [settings, setSettings] = useState<any>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Category State
  const [newCat, setNewCat] = useState({ id: 0, name: '', icon: 'Circle', color: '#808080' });
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);

  // Image Upload State
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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

  const handleAddOrUpdateCategory = async () => {
    if (!newCat.name) return;
    setAddingCat(true);
    try {
      let res;
      if (editingCatId) {
        // Update existing
        // Note: Assuming backend supports PUT /api/settings/categories/:id or similar.
        // If not, we might need to delete and re-add, or implement the PUT endpoint.
        // For now, let's assume we need to implement a PUT endpoint or similar logic.
        // Since the user asked for "edit", I will assume we need to add a PUT endpoint in worker.ts or handle it here.
        // Let's check worker.ts... it doesn't have PUT for categories.
        // I will implement a PUT endpoint in worker.ts in the next step.
        // For now, I'll use the PUT method here.
        res = await apiFetch(`/api/settings/categories/${editingCatId}`, {
          method: 'PUT',
          body: JSON.stringify(newCat)
        });
      } else {
        // Add new
        res = await apiFetch('/api/settings/categories', {
          method: 'POST',
          body: JSON.stringify(newCat)
        });
      }

      if (res.ok) {
        const catsRes = await apiFetch('/api/settings/categories');
        setCategories(await catsRes.json());
        setNewCat({ id: 0, name: '', icon: 'Circle', color: '#808080' });
        setEditingCatId(null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save category');
    } finally {
      setAddingCat(false);
    }
  };

  const handleEditCategory = (cat: any) => {
    setNewCat({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color });
    setEditingCatId(cat.id);
    // Scroll to form
    const form = document.getElementById('category-form');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setNewCat({ id: 0, name: '', icon: 'Circle', color: '#808080' });
    setEditingCatId(null);
  };

  const handleDeleteCategory = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering edit
    if (!confirm('Delete this category?')) return;
    try {
      const res = await apiFetch(`/api/settings/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const catsRes = await apiFetch('/api/settings/categories');
        setCategories(await catsRes.json());
        if (editingCatId === id) {
          handleCancelEdit();
        }
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
      window.location.reload();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setIsCropperOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (blob: Blob) => {
    setIsCropperOpen(false);
    setUploadingImage(true);
    try {
      const publicUrl = await uploadImageToSupabase(blob, 'settings');
      setSettings({ ...settings, top_bg_url: publicUrl });
    } catch (err) {
      console.error(err);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  if (user?.role !== 'Admin') return <div className="p-8 text-center text-zinc-500">Access Denied</div>;

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-orange-500" /></div>;

  return (
    <div className="min-h-full bg-black relative">
      {/* Sticky Header - Stick below the TopAppBar */}
      <div className="sticky top-0 z-30 bg-black border-b border-zinc-800/50 backdrop-blur-md bg-black/95 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {view !== 'main' && (
            <button onClick={() => setView('main')} className="p-2 -ml-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors">
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="text-2xl font-semibold text-white tracking-tight">
            {view === 'main' ? 'Settings' : view === 'categories' ? 'Categories' : 'System Settings'}
          </h2>
        </div>
        {view !== 'main' && (
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-xs font-bold uppercase tracking-wider rounded-full hover:bg-orange-600 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      {/* Content Area with Padding */}
      <div className="p-4 space-y-6 pb-24">
        {message && (
          <div className={`p-3 rounded-xl text-sm font-bold text-center mb-4 ${message.includes('Error') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
            {message}
          </div>
        )}

        <AnimatePresence mode="wait">
          {view === 'main' && (
            <motion.div 
              key="main"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <button 
                onClick={() => setView('categories')}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl text-left hover:bg-zinc-800 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Tag className="text-orange-500" size={24} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Categories</h3>
                    <p className="text-sm text-zinc-500 mt-1">Manage custom categories for expenses and activities</p>
                  </div>
                  <ChevronRight className="text-zinc-600 group-hover:text-white transition-colors" />
                </div>
              </button>

              <button 
                onClick={() => setView('system')}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl text-left hover:bg-zinc-800 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Database className="text-blue-500" size={24} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">System Settings</h3>
                    <p className="text-sm text-zinc-500 mt-1">App configuration, background image, and cache</p>
                  </div>
                  <ChevronRight className="text-zinc-600 group-hover:text-white transition-colors" />
                </div>
              </button>
            </motion.div>
          )}

          {view === 'categories' && (
            <motion.div
              key="categories"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {categories.map(cat => (
                    <div 
                      key={cat.id} 
                      onClick={() => handleEditCategory(cat)}
                      className={`flex items-center justify-between p-3 bg-zinc-950 border rounded-xl group relative cursor-pointer transition-colors ${editingCatId === cat.id ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: cat.color }}>
                          <DynamicIcon name={cat.icon} size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-white">{cat.name}</p>
                        </div>
                      </div>
                      {!cat.is_default && (
                        <button 
                          onClick={(e) => handleDeleteCategory(cat.id, e)}
                          className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div id="category-form" className="pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-zinc-400">{editingCatId ? 'Edit Category' : 'Add New Category'}</h4>
                    {editingCatId && (
                      <button onClick={handleCancelEdit} className="text-xs text-zinc-500 hover:text-white">Cancel</button>
                    )}
                  </div>
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
                      onClick={handleAddOrUpdateCategory}
                      disabled={addingCat || !newCat.name}
                      className={`w-full md:w-auto px-6 py-2.5 font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 h-[42px] ${editingCatId ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-zinc-800 text-white hover:bg-orange-500'}`}
                    >
                      {addingCat ? <Loader2 size={16} className="animate-spin" /> : (editingCatId ? <Save size={16} /> : <Plus size={16} />)}
                      {editingCatId ? 'Update' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'system' && (
            <motion.div
              key="system"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
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
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Top Background Image</label>
                  <div className="space-y-4">
                    {settings.top_bg_url && (
                      <div className="relative h-48 w-full rounded-xl overflow-hidden border border-zinc-800">
                        <img src={settings.top_bg_url} alt="Top Background" className="w-full h-full object-cover" />
                      </div>
                    )}
                    
                    <div className="flex items-center gap-4">
                      <label className="flex-1 cursor-pointer">
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleFileSelect}
                          className="hidden" 
                        />
                        <div className="flex items-center justify-center gap-2 w-full py-3 bg-zinc-800 border border-dashed border-zinc-600 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-400 transition-all">
                          <ImageIcon size={20} />
                          <span className="text-sm font-medium">Upload New Image</span>
                        </div>
                      </label>
                      {uploadingImage && <Loader2 className="animate-spin text-orange-500" />}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  {/* Cache clear moved to top app bar */}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Image Cropper Modal */}
      {isCropperOpen && selectedImage && (
        <ImageCropper
          imageSrc={selectedImage}
          aspect={16 / 9}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            setIsCropperOpen(false);
            setSelectedImage(null);
          }}
        />
      )}
    </div>
  );
}
