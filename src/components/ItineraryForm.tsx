import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2, Plus, Trash2, Camera, Image as ImageIcon, Upload, Sparkles, Lock, Unlock , Search} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { DynamicIcon } from './DynamicIcon';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { LocationPicker } from './LocationPicker';
import { clsx } from 'clsx';

interface ItineraryFormProps {
  tripId: number;
  date: string;
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

const safeParseArray = (data: any) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'string') return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
};

export function ItineraryForm({ tripId, date, onSuccess, onCancel, initialData }: ItineraryFormProps) {
  const { categories: storeCategories = [], setCategories, cities: storeCities = [] } = useAppStore();
  
  const groupedCities = useMemo(() => {
    return storeCities.reduce((acc: any, city: any) => {
      const country = city.country || 'Others';
      if (!acc[country]) acc[country] = [];
      acc[country].push(city);
      return acc;
    }, {});
  }, [storeCities]);

  const [isTimeFixed, setIsTimeFixed] = useState(initialData?.is_time_fixed === 1);
  const [stayDuration, setStayDuration] = useState(initialData?.stay_duration ? parseInt(initialData.stay_duration) : 60);
  const [timePreference, setTimePreference] = useState(initialData?.time_preference || 'anytime');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [tagInput, setTagInput] = useState('');

  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSubItemModalOpen, setIsSubItemModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  // 💡 Autocomplete 相關狀態
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const sessionToken = useRef(Math.random().toString(36).substring(2));

  const [editingSubItem, setEditingSubItem] = useState<any>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
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
    image_url: initialData?.image_url || '',
    google_place_id: initialData?.google_place_id || '',
    lat: initialData?.lat || null,
    lng: initialData?.lng || null,
    rating: initialData?.rating || null,
    reviews_count: initialData?.reviews_count || null,
    opening_hours: initialData?.opening_hours || '',
    place_website: initialData?.place_website || '',
    place_phone: initialData?.place_phone || '',
    next_transport_mode: initialData?.next_transport_mode || '',
    next_transport_time: initialData?.next_transport_time || '',
    next_transport_auto_time: initialData?.next_transport_auto_time || '' 
});

  });

  const [isLocationManuallyEdited, setIsLocationManuallyEdited] = useState(false);
  const selectedCategory = storeCategories.find(c => c.icon === formData.icon) || { color: '#808080', icon: 'MapPin' };

  // 💡 修正 A：正確解析 res.json() 來拿陣列資料
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (isLocationManuallyEdited && formData.address.length > 1) {
        setIsSearching(true);
        try {
          const res = await apiFetch(`/api/places/autocomplete?q=${encodeURIComponent(formData.address)}&session=${sessionToken.current}`);
          if (res.ok) {
            const data = await res.json(); // 💡 補上解碼 JSON
            setSuggestions(Array.isArray(data) ? data : []);
          } else {
            setSuggestions([]);
          }
        } catch (e) { 
          console.error(e); 
          setSuggestions([]);
        } finally { 
          setIsSearching(false); 
        }
      } else { 
        setSuggestions([]); 
      }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [formData.address, isLocationManuallyEdited]);

  // 💡 邏輯 B：點選建議 (填入地址與 ID)
  const handleSuggestionSelect = (suggestion: any) => {
    setFormData(prev => ({ 
      ...prev, 
      address: suggestion.description,
      google_place_id: suggestion.place_id 
    }));
    setSuggestions([]);
    setIsLocationManuallyEdited(false);
  };

  // 💡 邏輯 C：點選放大鏡 (正式去抓 Detail 並填入所有豐富資料)
  const handleFetchDetails = async () => {
    if (!formData.google_place_id) return;
    setIsSearching(true);
    try {
      const res = await apiFetch(`/api/places/details?placeId=${formData.google_place_id}&session=${sessionToken.current}`);
      if (res.ok) {
        const details = await res.json();
        if (details.location) {
          setFormData(prev => ({
            ...prev,
            lat: details.location.latitude,
            lng: details.location.longitude,
            // 💡 將後端轉好的圖片網址直接塞給卡片
            image_url: details.actual_photo_url || prev.image_url,
            rating: details.rating || null,
            reviews_count: details.userRatingCount || null,
            opening_hours: details.regularOpeningHours ? JSON.stringify(details.regularOpeningHours) : '',
            place_website: details.websiteUri || '',
            place_phone: details.internationalPhoneNumber || '',
            place_status: details.businessStatus || ''
          }));
          sessionToken.current = Math.random().toString(36).substring(2);
          alert('地點座標與詳細資訊已同步！✅');
        }
      }
    } catch (e) { alert('Failed to fetch location details.'); } 
    finally { setIsSearching(false); }
  };

  useEffect(() => {
    if (storeCategories.length === 0) {
      const fetchCats = async () => {
        try {
          const res = await apiFetch('/api/settings/categories');
          if (res.ok) setCategories(await res.json());
        } catch(e) { console.error(e); }
      }; fetchCats();
    }
  }, [storeCategories, setCategories]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, title: e.target.value }));
  };

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') setCroppingImage(reader.result); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    setCroppingImage(null); setUploading(true);
    try {
      const url = await uploadImageToSupabase(blob, 'itineraries');
      setFormData(prev => ({ ...prev, image_url: url }));
    } catch (err) { alert('Upload failed'); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/itineraries/${initialData.id}`, { method: 'DELETE' });
      if (res.ok) onSuccess();
    } catch (err) { alert('Delete failed'); }
    finally { setIsDeleting(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = { 
        ...formData, 
        trip_id: tripId, 
        date, 
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean), 
        sub_items: JSON.stringify(subItems),
        is_time_fixed: isTimeFixed ? 1 : 0, 
        stay_duration: stayDuration.toString(),
        time_preference: timePreference, 
      };
      const res = await apiFetch(initialData ? `/api/trips/${tripId}/itineraries/${initialData.id}` : `/api/trips/${tripId}/itineraries`, {
        method: initialData ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) onSuccess();
    } catch (err) { setError('Failed to save activity'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col w-full max-w-md mx-auto shadow-2xl relative max-h-[90vh]">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#1c1c1e]/90 backdrop-blur-md z-20 sticky top-0">
        <h2 className="text-lg font-bold text-white uppercase tracking-widest">{initialData ? 'Edit' : 'Add'} Activity</h2>
        <button type="button" onClick={onCancel} className="p-1.5 bg-zinc-800/50 rounded-full text-zinc-400 hover:text-white"><X size={18} /></button>
      </div>

      <div className="overflow-y-auto px-5 py-6 space-y-6 pb-32 custom-scrollbar">
        {error && <div className="text-red-400 text-xs font-bold bg-red-500/10 p-2 rounded-lg">{error}</div>}
        
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Icon</label>
            <button type="button" onClick={() => setIsIconPickerOpen(true)} className="h-12 bg-[#242426] border border-zinc-800 rounded-2xl flex items-center justify-center transition-all active:scale-95" style={{ color: selectedCategory.color }}>
              <DynamicIcon name={formData.icon} size={22} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">AI Lock</label>
            <button type="button" onClick={() => setIsTimeFixed(!isTimeFixed)} className={clsx("h-12 border rounded-2xl flex items-center justify-center transition-all", isTimeFixed ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500")}>
              {isTimeFixed ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Photo</label>
            <button type="button" onClick={() => setIsPhotoModalOpen(true)} className={clsx("h-12 border rounded-2xl flex items-center justify-center overflow-hidden transition-all", formData.image_url ? "border-orange-500/50" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500")}>
              {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" alt="Preview" /> : <Camera size={20} />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Activity Title</label>
          <input type="text" required value={formData.title} onChange={handleTitleChange} className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white font-bold text-base focus:border-orange-500 outline-none transition-all" />
        </div>

        <div className="space-y-3 pt-2">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Schedule Mode</label>
          <div className="flex bg-zinc-900/80 p-1.5 rounded-2xl border border-zinc-800 shadow-inner">
            <button type="button" onClick={() => setIsTimeFixed(true)} className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${isTimeFixed ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>固定時間 (Fixed)</button>
            <button type="button" onClick={() => setIsTimeFixed(false)} className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2 ${!isTimeFixed ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <Sparkles size={16} /> 智慧排程 (Smart)
            </button>
          </div>

          <AnimatePresence mode="wait">
            {isTimeFixed ? (
              <motion.div key="fixed" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="grid grid-cols-2 gap-3 bg-[#242426] border border-zinc-800 p-2 rounded-2xl">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-zinc-500 mb-0.5 font-bold uppercase tracking-tighter">Start Time</span>
                  <input type="time" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} className="bg-transparent text-white font-mono font-bold outline-none [color-scheme:dark]" />
                </div>
                <div className="flex flex-col items-center border-l border-zinc-700">
                  <span className="text-[9px] text-zinc-500 mb-0.5 font-bold uppercase tracking-tighter">End Time</span>
                  <input type="time" value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})} className="bg-transparent text-white font-mono font-bold outline-none [color-scheme:dark]" />
                </div>
              </motion.div>
            ) : (
              <motion.div key="smart" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="bg-orange-500/5 p-5 rounded-2xl border border-orange-500/20 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest ml-1">時段偏好 (Preference)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'anytime', label: '不限', desc: '00:00 - 24:00' },
                      { id: 'morning', label: '上午', desc: '06:00 - 12:00' },
                      { id: 'afternoon', label: '下午', desc: '12:00 - 18:00' },
                      { id: 'evening', label: '晚上', desc: '18:00 - 24:00' }
                    ].map((pref) => (
                      <button key={pref.id} type="button" onClick={() => setTimePreference(pref.id)} className={clsx("flex flex-col items-start p-3 rounded-2xl border transition-all", timePreference === pref.id ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700")}>
                        <span className="text-sm font-black">{pref.label}</span>
                        <span className={clsx("text-[9px] font-bold uppercase", timePreference === pref.id ? "text-orange-100" : "text-zinc-600")}>{pref.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4 pt-2 border-t border-orange-500/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest ml-1">停留長度</label>
                    <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
                      <input type="number" min="0" max="240" value={stayDuration} onChange={(e) => setStayDuration(Math.min(240, Math.max(0, parseInt(e.target.value) || 0)))} className="w-10 bg-transparent text-white text-sm font-black text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <span className="text-[10px] text-zinc-500 font-bold">MIN</span>
                    </div>
                  </div>
                  <input type="range" min="0" max="240" step="5" value={stayDuration} onChange={(e) => setStayDuration(parseInt(e.target.value))} className="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                  <div className="flex justify-between px-1 text-[9px] font-black text-zinc-600 uppercase"><span>0m</span><span>1h</span><span>2h</span><span>3h</span><span>4h</span></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 💡 Location & Address 區塊 */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5 ml-1">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Location Address</label>
            {formData.lat && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 rounded-full border border-green-500/20">
                <Sparkles size={8} className="text-green-500" />
                <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">GPS Ready</span>
              </div>
            )}
          </div>
          <div className="relative flex items-center group">
            <MapPin size={16} className={clsx("absolute left-4 z-10 transition-colors", isSearching ? "text-orange-500 animate-pulse" : "text-zinc-500")} />
            <input 
              type="text" 
              value={formData.address} 
              onChange={e => { setFormData({ ...formData, address: e.target.value }); setIsLocationManuallyEdited(true); }} 
              className="w-full bg-[#242426] border border-zinc-800 rounded-2xl pl-11 pr-12 py-3.5 text-white text-xs focus:border-orange-500 outline-none transition-all" 
              placeholder="打字搜尋地點..." 
            />
            {/* 💡 放大鏡按鈕：按了才抓 Details */}
            <button
              type="button"
              onClick={handleFetchDetails}
              disabled={!formData.google_place_id}
              className={clsx("absolute right-2 p-1.5 rounded-xl transition-all", formData.google_place_id ? "bg-zinc-800 text-orange-500 hover:bg-orange-500 hover:text-white" : "text-zinc-700 cursor-not-allowed")}
            >
              {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>

          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="absolute left-0 top-full z-[999] w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
              >
                <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                  {suggestions.map((s, idx) => (
                    <button key={idx} type="button" onClick={() => handleSuggestionSelect(s)} className="w-full px-4 py-3 flex items-start gap-3 hover:bg-zinc-800 text-left border-b border-zinc-800/50 last:border-0 group">
                      <MapPin size={14} className="mt-0.5 text-zinc-600 group-hover:text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">{s.structured_formatting.main_text}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{s.structured_formatting.secondary_text}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Notes</label>
          <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white text-xs focus:border-orange-500 outline-none min-h-[100px] resize-none transition-all" placeholder="Any special notes?" />
        </div>

        {initialData && (
          <div className="pt-4 border-t border-zinc-800">
            <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-full py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 border border-red-500/20"><Trash2 size={18} />Delete Activity</button>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5 bg-[#1c1c1e] border-t border-zinc-800 flex gap-3 z-20">
        <button type="button" onClick={onCancel} className="flex-1 py-4 rounded-2xl font-bold text-zinc-500 text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
        <button type="submit" disabled={loading || uploading} onClick={handleSubmit} className="flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all">
          {loading ? <Loader2 size={18} className="animate-spin" /> : (initialData ? 'Update Plan' : 'Add to Trip')}
        </button>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
              <h3 className="text-xl font-bold text-white mb-2">Delete Activity?</h3>
              <p className="text-zinc-400 mb-6">Are you sure you want to delete this activity? This cannot be undone.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">Cancel</button>
                <button type="button" onClick={handleDelete} disabled={isDeleting} className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors flex justify-center items-center gap-2">{isDeleting ? <Loader2 size={18} className="animate-spin" /> : 'Delete'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPhotoModalOpen && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[40px] w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative">
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50"><span className="text-xs font-black text-white uppercase tracking-widest">Photo Manager</span><button type="button" onClick={() => setIsPhotoModalOpen(false)} className="p-1"><X size={20} className="text-zinc-500" /></button></div>
              <div className="p-6 flex flex-col items-center gap-6">
                <div className="w-full aspect-[21/9] rounded-[28px] bg-zinc-950 border border-zinc-800 overflow-hidden relative shadow-inner">
                  {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" alt="Full" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 gap-2"><ImageIcon size={48} strokeWidth={1} /><span className="text-[10px] font-bold uppercase tracking-widest">No Photo</span></div>}
                  {uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-orange-500 backdrop-blur-sm"><Loader2 className="animate-spin" size={32} /></div>}
                </div>
                <div className="flex w-full gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase cursor-pointer hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5"><Upload size={16} /> Upload <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} /></label>
                  {formData.image_url && <button type="button" onClick={() => setFormData({...formData, image_url: ''})} className="w-16 flex items-center justify-center bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-colors"><Trash2 size={20} /></button>}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {croppingImage && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-md flex justify-between items-center mb-4 px-2"><span className="text-white font-black tracking-widest uppercase text-sm">Crop Image</span><button type="button" onClick={() => setCroppingImage(null)} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"><X size={20} /></button></div>
            <div className="w-full max-w-md h-[60vh] relative bg-zinc-950 rounded-[32px] overflow-hidden shadow-2xl border border-zinc-800">
              <ImageCropper image={croppingImage} aspect={21/9} onCropComplete={handleCropComplete} onCancel={() => setCroppingImage(null)} />
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isIconPickerOpen && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full p-6 shadow-2xl flex flex-col max-h-[60vh]">
              <div className="flex justify-between items-center mb-6 px-1"><h3 className="font-black text-white text-base uppercase tracking-widest">Select Category</h3><button type="button" onClick={() => setIsIconPickerOpen(false)} className="text-zinc-500 p-1.5 bg-zinc-800 rounded-full"><X size={16} /></button></div>
              <div className="overflow-y-auto grid grid-cols-4 gap-3 pb-8 custom-scrollbar">
                {storeCategories.map(cat => (
                  <button type="button" key={cat.id} onClick={() => { setFormData({ ...formData, icon: cat.icon }); setIsIconPickerOpen(false); }} className={clsx("flex flex-col items-center justify-center p-3.5 rounded-3xl transition-all border", formData.icon === cat.icon ? "border-white/20 bg-white/5 shadow-inner" : "border-transparent hover:bg-white/5")} style={{ color: cat.color }}>
                    <DynamicIcon name={cat.icon} size={24} /><span className="text-[9px] font-bold mt-2 text-zinc-400 truncate w-full text-center uppercase tracking-tighter">{cat.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSubItemModalOpen && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[28px] w-full max-w-[320px] p-6 shadow-3xl">
              <div className="flex justify-between items-center mb-5"><h3 className="font-bold text-white text-sm uppercase tracking-widest">Sub-Activity</h3><button type="button" onClick={() => setIsSubItemModalOpen(false)}><X size={18} className="text-zinc-500" /></button></div>
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
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2"><span className="block text-[8px] text-zinc-500 font-bold mb-1">START</span><input type="time" name="start_time" required defaultValue={editingSubItem?.start_time || formData.start_time} className="bg-transparent text-white font-mono text-xs w-full outline-none [color-scheme:dark]" /></div>
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2"><span className="block text-[8px] text-zinc-500 font-bold mb-1">END</span><input type="time" name="end_time" required defaultValue={editingSubItem?.end_time || formData.end_time} className="bg-transparent text-white font-mono text-xs w-full outline-none [color-scheme:dark]" /></div>
                </div>
                <textarea name="notes" defaultValue={editingSubItem?.notes} placeholder="Additional notes..." className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-xs outline-none min-h-[70px] focus:border-orange-500 transition-all" />
                <button type="submit" className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all">Save Sub-Activity</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <LocationPicker 
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        groupedCities={groupedCities}
        onSelect={(loc) => {
          setFormData(prev => ({
            ...prev,
            title: loc.name || prev.title, 
            address: loc.address || prev.address,
            google_place_id: loc.google_place_id || prev.google_place_id,
            lat: loc.lat || prev.lat,
            lng: loc.lng || prev.lng
          }));
          setIsLocationManuallyEdited(false);
        }}
      />  
    </div>
  );
}