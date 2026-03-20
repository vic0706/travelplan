import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2, Plus, Trash2, Lock, Unlock, Tag as TagIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { DynamicIcon } from './DynamicIcon';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

interface ItineraryFormProps {
  tripId: number;
  date: string;
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

export function ItineraryForm({ tripId, date, onSuccess, onCancel, initialData }: ItineraryFormProps) {
  const { categories: storeCategories = [], setCategories } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tagInput, setTagInput] = useState('');

  // UI 狀態
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isSubItemModalOpen, setIsSubItemModalOpen] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<any>(null);

  useEffect(() => {
    if (storeCategories.length === 0) {
      const fetchCats = async () => {
        const res = await apiFetch('/api/settings/categories');
        if (res.ok) setCategories(await res.json());
      };
      fetchCats();
    }
  }, [storeCategories, setCategories]);

  const [subItems, setSubItems] = useState<any[]>(
    initialData?.sub_items ? JSON.parse(initialData.sub_items) : []
  );

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    address: initialData?.address || '',
    start_time: initialData?.start_time || '09:00',
    end_time: initialData?.end_time || '10:00',
    notes: initialData?.notes || '',
    icon: initialData?.icon || 'MapPin',
    tags: initialData?.tags ? (Array.isArray(initialData.tags) ? initialData.tags.join(', ') : initialData.tags) : '',
    is_time_fixed: initialData?.is_time_fixed || 0,
    google_place_id: initialData?.google_place_id || ''
  });

  const selectedCategory = storeCategories.find(c => c.icon === formData.icon) || { color: '#808080', icon: 'MapPin' };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = tagInput.trim();
      if (val) {
        const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()) : [];
        if (!tags.includes(val)) setFormData({ ...formData, tags: [...tags, val].join(', ') });
        setTagInput('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...formData, trip_id: tripId, date, tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean), sub_items: JSON.stringify(subItems) };
      const res = await apiFetch(initialData ? `/api/trips/${tripId}/itineraries/${initialData.id}` : `/api/trips/${tripId}/itineraries`, {
        method: initialData ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) onSuccess();
    } catch (err) { setError('Save failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col w-full max-w-md mx-auto shadow-2xl relative max-h-[90vh]">
      
      {/* Header - 縮小 Padding */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#1c1c1e]/90 backdrop-blur-md z-10">
        <h2 className="text-lg font-bold text-white">{initialData ? 'Edit' : 'Add'} Activity</h2>
        <button onClick={onCancel} className="p-1.5 bg-zinc-800/50 rounded-full text-zinc-400"><X size={18} /></button>
      </div>

      <div className="overflow-y-auto px-5 py-6 space-y-5 pb-32 custom-scrollbar">
        
        {/* ICON & TITLE - 縮小元件尺寸 */}
        <div className="flex gap-3 items-end">
          <div className="shrink-0">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Icon</label>
            <button type="button" onClick={() => setIsIconPickerOpen(true)} className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/5 shadow-lg transition-all active:scale-95" style={{ backgroundColor: `${selectedCategory.color}15`, color: selectedCategory.color }}>
              <DynamicIcon name={selectedCategory.icon} size={22} />
            </button>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Activity Title</label>
            <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white font-bold text-base focus:border-orange-500 outline-none" placeholder="Activity name..." />
          </div>
        </div>

        {/* TIME GRID - 重新排版解決擠壓問題 */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Schedule & AI Lock</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2 bg-[#242426] border border-zinc-800 p-1.5 rounded-xl">
              <input type="time" value={formData.start_time} onChange={e => setFormData({ ...formData, start_time: e.target.value })} className="bg-transparent text-white font-mono font-bold text-sm text-center outline-none [color-scheme:dark]" />
              <input type="time" value={formData.end_time} onChange={e => setFormData({ ...formData, end_time: e.target.value })} className="bg-transparent text-white font-mono font-bold text-sm text-center border-l border-zinc-700 outline-none [color-scheme:dark]" />
            </div>
            
            <button type="button" onClick={() => setFormData({ ...formData, is_time_fixed: formData.is_time_fixed ? 0 : 1 })} className={clsx("p-2.5 rounded-xl border transition-all shrink-0", formData.is_time_fixed ? "bg-orange-500 border-orange-400 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-500")}>
              {formData.is_time_fixed ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
          </div>
        </div>

        {/* LOCATION - 縮減高度 */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Location</label>
          <div className="relative">
            <MapPin size={16} className="absolute left-3.5 top-3 text-zinc-500" />
            <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full bg-[#242426] border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-xs focus:border-orange-500 outline-none" placeholder="Search address..." />
          </div>
        </div>

        {/* TAGS - 精簡 Chip 尺寸 */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Tags</label>
          <div className="bg-[#242426] border border-zinc-800 rounded-xl p-1.5 flex flex-wrap gap-1.5 items-center">
            {formData.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
              <span key={tag} className="bg-orange-500/10 text-orange-500 border border-orange-500/10 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                {tag}
                <button type="button" onClick={() => setFormData({ ...formData, tags: formData.tags.split(',').map(t=>t.trim()).filter(t=>t!==tag).join(', ') })}><X size={10} /></button>
              </span>
            ))}
            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} className="flex-1 bg-transparent border-none outline-none text-white text-xs px-1 min-w-[80px]" placeholder="+ tag" />
          </div>
        </div>

        {/* SUB-ACTIVITY - 縮小清單間距 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sub-Activities</label>
            <button type="button" onClick={() => { setEditingSubItem(null); setIsSubItemModalOpen(true); }} className="text-[10px] text-orange-500 font-bold px-2 py-1 bg-orange-500/10 rounded-lg">+ Add</button>
          </div>
          <div className="space-y-2">
            {subItems.length > 0 ? subItems.map((item, idx) => (
              <div key={idx} onClick={() => { setEditingSubItem(item); setIsSubItemModalOpen(true); }} className="bg-[#242426] border border-zinc-800 p-3 rounded-xl flex items-center justify-between group cursor-pointer hover:border-zinc-600 transition-all">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  <div>
                    <div className="text-xs font-bold text-white">{item.title}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{item.start_time}—{item.end_time}</div>
                  </div>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setSubItems(subItems.filter((_, i) => i !== idx)); }} className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            )) : <div className="text-center py-4 border border-dashed border-zinc-800/50 rounded-xl text-zinc-600 text-[10px] uppercase font-bold tracking-widest">Empty</div>}
          </div>
        </div>

        {/* NOTES - 縮小字體 */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Notes</label>
          <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-xs focus:border-orange-500 outline-none min-h-[80px] resize-none" placeholder="Details..." />
        </div>
      </div>

      {/* Footer - 縮小高度 */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#1c1c1e] border-t border-zinc-800 z-10 flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-zinc-500 hover:bg-zinc-800 text-sm">Cancel</button>
        <button type="submit" disabled={loading} onClick={handleSubmit} className="flex-[2] py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : (initialData ? 'Update' : 'Create')}
        </button>
      </div>

      {/* Category Picker */}
      <AnimatePresence>
        {isIconPickerOpen && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full p-6 shadow-2xl flex flex-col max-h-[60vh]">
              <div className="flex justify-between items-center mb-5"><h3 className="font-black text-white text-base">Categories</h3><button onClick={() => setIsIconPickerOpen(false)} className="text-zinc-500 p-1.5 bg-zinc-800 rounded-full"><X size={16} /></button></div>
              <div className="overflow-y-auto grid grid-cols-4 gap-2.5 pb-6">
                {storeCategories.map(cat => (
                  <button key={cat.id} onClick={() => { setFormData({ ...formData, icon: cat.icon }); setIsIconPickerOpen(false); }} className={clsx("flex flex-col items-center justify-center p-3 rounded-2xl transition-all border", formData.icon === cat.icon ? "border-white/20 bg-white/5" : "border-transparent")} style={{ color: cat.color }}>
                    <DynamicIcon name={cat.icon} size={24} /><span className="text-[9px] font-bold mt-1.5 text-zinc-400 truncate w-full text-center">{cat.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-Item Modal - 關鍵修復排版 */}
      <AnimatePresence>
        {isSubItemModalOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[24px] w-full max-w-[300px] p-5 shadow-2xl">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white text-sm">Sub-Activity</h3><button onClick={() => setIsSubItemModalOpen(false)}><X size={16} className="text-zinc-500" /></button></div>
              <form onSubmit={(e:any) => { e.preventDefault(); const f = e.target; const newItem = { id: editingSubItem?.id || Date.now().toString(), title: f.title.value, start_time: f.start_time.value, end_time: f.end_time.value, notes: f.notes.value }; if (editingSubItem) setSubItems(subItems.map(i => i.id === editingSubItem.id ? newItem : i)); else setSubItems([...subItems, newItem].sort((a,b)=>a.start_time.localeCompare(b.start_time))); setIsSubItemModalOpen(false); }} className="space-y-3">
                <input type="text" name="title" required defaultValue={editingSubItem?.title} placeholder="Sub-title" className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs outline-none" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="time" name="start_time" required defaultValue={editingSubItem?.start_time || formData.start_time} className="bg-[#242426] border border-zinc-800 rounded-lg px-2 py-1.5 text-white font-mono text-[10px] [color-scheme:dark]" />
                  <input type="time" name="end_time" required defaultValue={editingSubItem?.end_time || formData.end_time} className="bg-[#242426] border border-zinc-800 rounded-lg px-2 py-1.5 text-white font-mono text-[10px] [color-scheme:dark]" />
                </div>
                <textarea name="notes" defaultValue={editingSubItem?.notes} placeholder="Sub-notes" className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs outline-none min-h-[60px]" />
                <button type="submit" className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-bold text-xs">Save Sub</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}