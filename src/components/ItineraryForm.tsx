import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2, Plus, Trash2, Lock, Unlock, Camera, Image as ImageIcon, Upload, Tag as TagIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { DynamicIcon } from './DynamicIcon';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { clsx } from 'clsx';

interface ItineraryFormProps {
  tripId: number;
  date: string;
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

// 安全解析陣列的工具，防止空字串 "" 導致的 JSON 崩潰
const safeParseArray = (data: any) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'string') return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
};

export function ItineraryForm({ tripId, date, onSuccess, onCancel, initialData }: ItineraryFormProps) {
  const { categories: storeCategories = [], setCategories } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [tagInput, setTagInput] = useState('');

  // UI 狀態控制
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSubItemModalOpen, setIsSubItemModalOpen] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<any>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);

  // 資料狀態
  const [subItems, setSubItems] = useState<any[]>(safeParseArray(initialData?.sub_items));
  const initialTagsArray = safeParseArray(initialData?.tags);

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    address: initialData?.address || '',
    start_time: initialData?.start_time || '09:00',
    end_time: initialData?.end_time || '10:00',
    notes: initialData?.notes || '',
    icon: initialData?.icon || 'MapPin',
    tags: initialTagsArray.join(', '), 
    is_time_fixed: initialData?.is_time_fixed || 0,
    image_url: initialData?.image_url || '',
    google_place_id: initialData?.google_place_id || ''
  });

  const [isLocationManuallyEdited, setIsLocationManuallyEdited] = useState(!!initialData?.address);
  const selectedCategory = storeCategories.find(c => c.icon === formData.icon) || { color: '#808080', icon: 'MapPin' };

  // 載入分類
  useEffect(() => {
    if (storeCategories.length === 0) {
      const fetchCats = async () => {
        try {
          const res = await apiFetch('/api/settings/categories');
          if (res.ok) {
            const data = await res.json();
            setCategories(data);
          }
        } catch(e) { console.error("Category load error", e); }
      }; fetchCats();
    }
  }, [storeCategories, setCategories]);

  // 標題與地點同步
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setFormData(prev => ({
      ...prev,
      title: newTitle,
      address: isLocationManuallyEdited ? prev.address : newTitle
    }));
  };

  // 處理標籤輸入
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = tagInput.trim();
      if (val) {
        const currentTags = formData.tags ? formData.tags.split(',').map(t => t.trim()) : [];
        if (!currentTags.includes(val)) {
          setFormData({ ...formData, tags: [...currentTags, val].join(', ') });
        }
        setTagInput('');
      }
    }
  };

  // 照片讀取處理 (解決黑屏：一定要等 onload 完成)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("檔案太大了，請選擇 5MB 以下的圖片");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        console.log("圖片讀取完成，長度：", reader.result.length);
        setCroppingImage(reader.result); // 觸發裁切窗顯示
      }
    };

    reader.onerror = () => {
      console.error("圖片讀取失敗");
      alert("讀取檔案失敗，請換一張試試");
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    setCroppingImage(null);
    setUploading(true);
    try {
      const url = await uploadImageToSupabase(blob, 'itineraries');
      setFormData(prev => ({ ...prev, image_url: url }));
    } catch (err) { alert('Upload failed'); }
    finally { setUploading(false); }
  };

  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = { 
        ...formData, trip_id: tripId, date, 
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean), 
        sub_items: JSON.stringify(subItems) 
      };
      const res = await apiFetch(initialData ? `/api/trips/${tripId}/itineraries/${initialData.id}` : `/api/trips/${tripId}/itineraries`, {
        method: initialData ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) onSuccess();
      else throw new Error('Save failed');
    } catch (err) { setError('Failed to save activity'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col w-full max-w-md mx-auto shadow-2xl relative max-h-[90vh]">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#1c1c1e]/90 backdrop-blur-md z-20 sticky top-0">
        <h2 className="text-lg font-bold text-white uppercase tracking-widest">{initialData ? 'Edit' : 'Add'} Activity</h2>
        <button onClick={onCancel} className="p-1.5 bg-zinc-800/50 rounded-full text-zinc-400"><X size={18} /></button>
      </div>

      {/* 內容區 */}
      <div className="overflow-y-auto px-5 py-6 space-y-6 pb-32 custom-scrollbar">
        {error && <div className="text-red-400 text-xs font-bold bg-red-500/10 p-2 rounded-lg">{error}</div>}
        
        {/* Row 1: ICON | LOCK | PHOTO */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Icon</label>
            <button type="button" onClick={() => setIsIconPickerOpen(true)} className="h-12 bg-[#242426] border border-zinc-800 rounded-2xl flex items-center justify-center transition-all active:scale-95" style={{ color: selectedCategory.color }}>
              <DynamicIcon name={formData.icon} size={22} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">AI Lock</label>
            <button type="button" onClick={() => setFormData({ ...formData, is_time_fixed: formData.is_time_fixed ? 0 : 1 })} className={clsx("h-12 border rounded-2xl flex items-center justify-center transition-all", formData.is_time_fixed ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20" : "bg-zinc-800 border-zinc-700 text-zinc-500")}>
              {formData.is_time_fixed ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Photo</label>
            <button type="button" onClick={() => setIsPhotoModalOpen(true)} className={clsx("h-12 border rounded-2xl flex items-center justify-center overflow-hidden transition-all", formData.image_url ? "border-orange-500/50" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500")}>
              {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" alt="Preview" /> : <Camera size={20} />}
            </button>
          </div>
        </div>

        {/* 活動標題 */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Activity Title</label>
          <input type="text" required value={formData.title} onChange={handleTitleChange} className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white font-bold text-base focus:border-orange-500 outline-none transition-all" placeholder="Where are we going?" />
        </div>

        {/* 時間 */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Schedule</label>
          <div className="grid grid-cols-2 gap-3 bg-[#242426] border border-zinc-800 p-2 rounded-2xl">
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-zinc-500 mb-0.5 font-bold uppercase tracking-tighter">Start Time</span>
              <input type="time" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} className="bg-transparent text-white font-mono font-bold outline-none [color-scheme:dark]" />
            </div>
            <div className="flex flex-col items-center border-l border-zinc-700">
              <span className="text-[9px] text-zinc-500 mb-0.5 font-bold uppercase tracking-tighter">End Time</span>
              <input type="time" value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})} className="bg-transparent text-white font-mono font-bold outline-none [color-scheme:dark]" />
            </div>
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Location Address</label>
          <div className="relative">
            <MapPin size={16} className="absolute left-4 top-3.5 text-zinc-500" />
            <input type="text" value={formData.address} onChange={e => { setFormData({ ...formData, address: e.target.value }); setIsLocationManuallyEdited(true); }} className="w-full bg-[#242426] border border-zinc-800 rounded-2xl pl-11 pr-4 py-3 text-white text-xs focus:border-orange-500 outline-none transition-all" placeholder="Search or enter address..." />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Tags</label>
          <div className="bg-[#242426] border border-zinc-800 rounded-2xl p-2 flex flex-wrap gap-2 items-center">
            {formData.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
              <span key={tag} className="bg-orange-500/10 text-orange-500 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5">
                {tag}
                <button type="button" onClick={() => setFormData({ ...formData, tags: formData.tags.split(',').map(t=>t.trim()).filter(t=>t!==tag).join(', ') })} className="hover:text-white transition-colors"><X size={10} /></button>
              </span>
            ))}
            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} className="flex-1 bg-transparent border-none outline-none text-white text-xs px-1 min-w-[80px]" placeholder="+ add tag" />
          </div>
        </div>

        {/* Sub-Activities */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sub-Activities</label>
            <button type="button" onClick={() => { setEditingSubItem(null); setIsSubItemModalOpen(true); }} className="text-[10px] text-orange-500 font-bold px-2.5 py-1 bg-orange-500/10 rounded-lg hover:bg-orange-500/20 transition-all">+ Add</button>
          </div>
          <div className="space-y-2">
            {subItems.length > 0 ? subItems.map((item, idx) => (
              <div key={idx} onClick={() => { setEditingSubItem(item); setIsSubItemModalOpen(true); }} className="bg-[#242426] border border-zinc-800 p-3 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-zinc-600 transition-all shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                  <div>
                    <div className="text-xs font-bold text-white">{item.title}</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{item.start_time}—{item.end_time}</div>
                  </div>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setSubItems(subItems.filter((_, i) => i !== idx)); }} className="p-2 text-zinc-600 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            )) : <div className="text-center py-6 border border-dashed border-zinc-800/50 rounded-2xl text-zinc-600 text-[10px] uppercase font-bold tracking-[0.2em]">No sub-items</div>}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Notes & Tips</label>
          <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white text-xs focus:border-orange-500 outline-none min-h-[100px] resize-none transition-all" placeholder="Any special notes for this activity?" />
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-[#1c1c1e] border-t border-zinc-800 flex gap-3 z-20">
        <button type="button" onClick={onCancel} className="flex-1 py-4 rounded-2xl font-bold text-zinc-500 text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
        <button type="submit" disabled={loading || uploading} onClick={handleSubmit} className="flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all">
          {loading ? <Loader2 size={18} className="animate-spin" /> : (initialData ? 'Update Plan' : 'Add to Trip')}
        </button>
      </div>

      {/* 照片管理彈窗 */}
      <AnimatePresence>
        {isPhotoModalOpen && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[40px] w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative">
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                <span className="text-xs font-black text-white uppercase tracking-widest">Photo Manager</span>
                <button onClick={() => setIsPhotoModalOpen(false)} className="p-1"><X size={20} className="text-zinc-500" /></button>
              </div>
              <div className="p-6 flex flex-col items-center gap-6">
                <div className="w-full aspect-[21/9] rounded-[28px] bg-zinc-950 border border-zinc-800 overflow-hidden relative shadow-inner">
                  {formData.image_url ? (
                    <img src={formData.image_url} className="w-full h-full object-cover" alt="Full" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 gap-2"><ImageIcon size={48} strokeWidth={1} /><span className="text-[10px] font-bold uppercase tracking-widest">No Photo</span></div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-orange-500 backdrop-blur-sm"><Loader2 className="animate-spin" size={32} /></div>
                  )}
                </div>
                <div className="flex w-full gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase cursor-pointer hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5">
                    <Upload size={16} /> Upload <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                  </label>
                  {formData.image_url && <button onClick={() => setFormData({...formData, image_url: ''})} className="w-16 flex items-center justify-center bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-colors"><Trash2 size={20} /></button>}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 裁切視窗：強制放在最外層、最高層級 (z-[9999]) 並給予明確高度 */}
      <AnimatePresence>
        {croppingImage && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-md flex justify-between items-center mb-4 px-2">
              <span className="text-white font-black tracking-widest uppercase text-sm">Crop Image</span>
              <button onClick={() => setCroppingImage(null)} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"><X size={20} /></button>
            </div>
            
            {/* 這裡一定要有相對定位與高度 */}
            <div className="w-full max-w-md h-[60vh] relative bg-zinc-950 rounded-[32px] overflow-hidden shadow-2xl border border-zinc-800">
              <ImageCropper 
                image={croppingImage} 
                aspect={21/9} 
                onCropComplete={handleCropComplete} 
                onCancel={() => setCroppingImage(null)} 
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 分類選擇窗 */}
      <AnimatePresence>
        {isIconPickerOpen && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full p-6 shadow-2xl flex flex-col max-h-[60vh]">
              <div className="flex justify-between items-center mb-6 px-1">
                <h3 className="font-black text-white text-base uppercase tracking-widest">Select Category</h3>
                <button onClick={() => setIsIconPickerOpen(false)} className="text-zinc-500 p-1.5 bg-zinc-800 rounded-full"><X size={16} /></button>
              </div>
              <div className="overflow-y-auto grid grid-cols-4 gap-3 pb-8 custom-scrollbar">
                {storeCategories.map(cat => (
                  <button key={cat.id} onClick={() => { setFormData({ ...formData, icon: cat.icon }); setIsIconPickerOpen(false); }} className={clsx("flex flex-col items-center justify-center p-3.5 rounded-3xl transition-all border", formData.icon === cat.icon ? "border-white/20 bg-white/5 shadow-inner" : "border-transparent hover:bg-white/5")} style={{ color: cat.color }}>
                    <DynamicIcon name={cat.icon} size={24} />
                    <span className="text-[9px] font-bold mt-2 text-zinc-400 truncate w-full text-center uppercase tracking-tighter">{cat.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 子項目編輯窗 */}
      <AnimatePresence>
        {isSubItemModalOpen && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[28px] w-full max-w-[320px] p-6 shadow-3xl">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-white text-sm uppercase tracking-widest">Sub-Activity</h3>
                <button onClick={() => setIsSubItemModalOpen(false)}><X size={18} className="text-zinc-500" /></button>
              </div>
              <form onSubmit={(e:any) => { 
                e.preventDefault(); 
                const f = e.target; 
                const newItem = { id: editingSubItem?.id || Date.now().toString(), title: f.title.value, start_time: f.start_time.value, end_time: f.end_time.value, notes: f.notes.value }; 
                if (editingSubItem) setSubItems(subItems.map(i => i.id === editingSubItem.id ? newItem : i)); 
                else setSubItems([...subItems, newItem].sort((a,b)=>a.start_time.localeCompare(b.start_time))); 
                setIsSubItemModalOpen(false); 
              }} className="space-y-4">
                <input type="text" name="title" required defaultValue={editingSubItem?.title} placeholder="What is this sub-task?" className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-xs outline-none focus:border-orange-500 transition-all" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2">
                    <span className="block text-[8px] text-zinc-500 font-bold mb-1">START</span>
                    <input type="time" name="start_time" required defaultValue={editingSubItem?.start_time || formData.start_time} className="bg-transparent text-white font-mono text-xs w-full outline-none [color-scheme:dark]" />
                  </div>
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2">
                    <span className="block text-[8px] text-zinc-500 font-bold mb-1">END</span>
                    <input type="time" name="end_time" required defaultValue={editingSubItem?.end_time || formData.end_time} className="bg-transparent text-white font-mono text-xs w-full outline-none [color-scheme:dark]" />
                  </div>
                </div>
                <textarea name="notes" defaultValue={editingSubItem?.notes} placeholder="Additional notes..." className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-xs outline-none min-h-[70px] focus:border-orange-500 transition-all" />
                <button type="submit" className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all">Save Sub-Activity</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}