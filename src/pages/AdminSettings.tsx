import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Save, Database, Loader2, Plus, Trash2, Tag, ArrowLeft, Image as ImageIcon, ChevronRight, Activity } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { ImageCropper, uploadImageToSupabase } from '../components/widgets/ImageCropper';
import { motion, AnimatePresence } from 'framer-motion';
import { DynamicIcon } from '../components/common/DynamicIcon';
import { API_FREE_LIMITS } from '../utils/apiQuota';

export function AdminSettings() {
  const { user } = useAppStore();
  const [view, setView] = useState<'main' | 'categories' | 'system' | 'api'>('main');
  const [settings, setSettings] = useState<any>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Category State
  const [newCat, setNewCat] = useState({ id: 0, name: '', icon: 'Circle', color: '#808080' });
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);

  // Google API usage state
  const [apiUsage, setApiUsage] = useState<Record<string, { count: number; limit: number; freeLimit: number }>>({});
  const [apiUsageLoading, setApiUsageLoading] = useState(false);
  const [savingLimit, setSavingLimit] = useState<string | null>(null);
  const [editingLimits, setEditingLimits] = useState<Record<string, number>>({});

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
        if (settingsRes.ok) setSettings(await settingsRes.json());
        if (catsRes.ok) setCategories(await catsRes.json());
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (view === 'api') fetchApiUsage();
  }, [view]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setMessage('設定已儲存！');
        setTimeout(() => setMessage(''), 3000);
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (err) {
      console.error(err);
      setMessage('儲存設定時發生錯誤');
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
      alert('儲存類別失敗');
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
    if (!confirm('確定要刪除此類別？')) return;
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
      alert('刪除類別失敗');
    }
  };

  const handleClearCache = async () => {
    if (window.confirm('此操作將清除所有本機資料並重新載入，確定繼續？')) {
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
      alert('上傳圖片失敗');
    } finally {
      setUploadingImage(false);
    }
  };

  const fetchApiUsage = async () => {
    setApiUsageLoading(true);
    try {
      const res = await apiFetch('/api/settings/api-usage');
      if (res.ok) {
        const data = await res.json() as any;
        setApiUsage(data);
        const limits: Record<string, number> = {};
        for (const [k, v] of Object.entries(data)) limits[k] = (v as any).limit;
        setEditingLimits(limits);
      }
    } catch { /* silent */ }
    finally { setApiUsageLoading(false); }
  };

  const handleSaveApiLimit = async (apiName: string) => {
    setSavingLimit(apiName);
    try {
      const res = await apiFetch('/api/settings/api-limit', {
        method: 'PUT',
        body: JSON.stringify({ apiName, limit: editingLimits[apiName] })
      });
      if (res.ok) await fetchApiUsage();
    } catch { /* silent */ }
    finally { setSavingLimit(null); }
  };

  if (user?.role !== 'Admin') return <div className="p-8 text-center text-zinc-500">存取被拒</div>;

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
            {view === 'main' ? '設定' : view === 'categories' ? '類別管理' : view === 'api' ? 'Google API 用量' : '系統設定'}
          </h2>
        </div>
        {view !== 'main' && (
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-xs font-bold uppercase tracking-wider rounded-full hover:bg-orange-600 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? '儲存中...' : '儲存'}
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
                    <h3 className="text-lg font-bold text-white">類別管理</h3>
                    <p className="text-sm text-zinc-500 mt-1">管理消費與活動的自訂類別</p>
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
                    <h3 className="text-lg font-bold text-white">系統設定</h3>
                    <p className="text-sm text-zinc-500 mt-1">應用程式設定、背景圖片與快取</p>
                  </div>
                  <ChevronRight className="text-zinc-600 group-hover:text-white transition-colors" />
                </div>
              </button>

              <button
                onClick={() => setView('api')}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl text-left hover:bg-zinc-800 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Activity className="text-green-500" size={24} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Google API 用量</h3>
                    <p className="text-sm text-zinc-500 mt-1">監控本月 API 使用次數與免費上限</p>
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
                    <h4 className="text-sm font-medium text-zinc-400">{editingCatId ? '編輯類別' : '新增類別'}</h4>
                    {editingCatId && (
                      <button onClick={handleCancelEdit} className="text-xs text-zinc-500 hover:text-white">取消</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="text-xs text-zinc-500 mb-1 block">名稱</label>
                      <input
                        type="text"
                        value={newCat.name}
                        onChange={e => setNewCat({...newCat, name: e.target.value})}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                        placeholder="例如：零食"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="text-xs text-zinc-500 mb-1 block">圖示（Lucide 名稱）</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newCat.icon}
                          onChange={e => setNewCat({...newCat, icon: e.target.value})}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 pr-10"
                          placeholder="例如：Coffee"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                          <DynamicIcon name={newCat.icon} size={16} />
                        </div>
                      </div>
                    </div>
                    <div className="w-full md:w-auto">
                      <label className="text-xs text-zinc-500 mb-1 block">顏色</label>
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
                      {editingCatId ? '更新' : '新增'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'api' && (
            <motion.div
              key="api"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {apiUsageLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={28} /></div>
              ) : (
                <>
                  <p className="text-xs text-zinc-500 px-1">本月免費額度（各 API 獨立計算，每月 1 號重置）</p>
                  {Object.entries(apiUsage).map(([apiName, { count, limit, freeLimit }]) => {
                    const pct = Math.min(100, Math.round((count / freeLimit) * 100));
                    const isOver = count >= limit;
                    const API_LABELS: Record<string, string> = {
                      places_autocomplete: 'Places Autocomplete',
                      place_details:       'Place Details',
                      place_search:        'Place Search',
                      route_matrix:        'Route Matrix',
                      compute_routes:      'Compute Routes',
                    };
                    return (
                      <div key={apiName} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-white">{API_LABELS[apiName] || apiName}</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              本月 {count.toLocaleString()} / 免費上限 {freeLimit.toLocaleString()} 次
                            </p>
                          </div>
                          {isOver && (
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded-full">封鎖中</span>
                          )}
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-zinc-500 font-bold whitespace-nowrap">封鎖閾值</label>
                          <input
                            type="number" min="0" max={freeLimit}
                            value={editingLimits[apiName] ?? limit}
                            onChange={e => setEditingLimits(prev => ({ ...prev, [apiName]: parseInt(e.target.value) || 0 }))}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                          />
                          <button
                            onClick={() => handleSaveApiLimit(apiName)}
                            disabled={savingLimit === apiName}
                            className="px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                          >
                            {savingLimit === apiName ? <Loader2 size={14} className="animate-spin" /> : '儲存'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={fetchApiUsage}
                    className="w-full py-3 bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold rounded-2xl transition-colors"
                  >
                    重新整理用量
                  </button>
                </>
              )}
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
                  <label className="block text-sm font-medium text-zinc-400 mb-2">應用程式名稱</label>
                  <input 
                    type="text" 
                    value={settings.app_name || ''} 
                    onChange={e => setSettings({...settings, app_name: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Travel Plan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">頂部背景圖片</label>
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
                          <span className="text-sm font-medium">上傳新圖片</span>
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
