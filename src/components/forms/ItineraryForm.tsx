import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../../store';
import { X, MapPin, Loader2, Plus, Trash2, Camera, Image as ImageIcon, Upload, Sparkles, Lock, Unlock, Search, Database, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../../utils/api';
import { DynamicIcon } from '../common/DynamicIcon';
import { ImageCropper, uploadImageToSupabase } from '../widgets/ImageCropper';
import { LocationPicker } from '../pickers/LocationPicker';
import { clsx } from 'clsx';
import { db, getCachedPlaceSuggestions, cachePlaceSuggestions, getCachedPlaceDetails, cachePlaceDetails } from '../../db';

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
  try { const p = JSON.parse(data); return Array.isArray(p) ? p : []; } catch { return []; }
};

const addMinutesToTime = (timeStr: string, minutes: number): string => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + (m || 0) + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
};

const timeToMinutes = (t1: string, t2: string): number => {
  if (!t1 || !t2) return 60;
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  return diff > 0 ? diff : 60;
};

export function ItineraryForm({ tripId, date, onSuccess, onCancel, initialData }: ItineraryFormProps) {
  const { categories: storeCategories = [], setCategories, cities: storeCities = [] } = useAppStore();

  const groupedCities = useMemo(() => storeCities.reduce((acc: any, city: any) => {
    const country = city.country || 'Others';
    if (!acc[country]) acc[country] = [];
    acc[country].push(city);
    return acc;
  }, {}), [storeCities]);

  const [isTimeFixed, setIsTimeFixed] = useState(initialData?.is_time_fixed === 1);
  const [stayDuration, setStayDuration] = useState(
    initialData?.stay_duration ? parseInt(initialData.stay_duration) : 60
  );
  const [fixedStayDuration, setFixedStayDuration] = useState(() => {
    if (initialData?.start_time && initialData?.end_time) {
      return timeToMinutes(initialData.start_time, initialData.end_time);
    }
    return 60;
  });
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
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [knownPlaceIds, setKnownPlaceIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const sessionToken = useRef(Math.random().toString(36).substring(2));
  const [editingSubItem, setEditingSubItem] = useState<any>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [subItems, setSubItems] = useState<any[]>(safeParseArray(initialData?.sub_items));

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    address: initialData?.address || '',
    start_time: initialData?.start_time || '',
    end_time: initialData?.end_time || '',
    notes: initialData?.notes || '',
    icon: initialData?.icon || 'MapPin',
    tags: safeParseArray(initialData?.tags).join(', '),
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

  const [isLocationManuallyEdited, setIsLocationManuallyEdited] = useState(false);
  const selectedCategory = storeCategories.find((c: any) => c.icon === formData.icon) || { color: '#808080', icon: 'MapPin' };

  useEffect(() => {
    db.itineraries.toArray().then(items => {
      setKnownPlaceIds(new Set(items.map(i => i.google_place_id).filter(Boolean) as string[]));
    });
  }, []);

  // 自動搜尋地點（帶 DB 快取）
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!isLocationManuallyEdited || formData.address.length < 2) { setSuggestions([]); return; }
      setIsSearching(true);
      setFromCache(false);
      try {
        const q = formData.address;
        const cached = await getCachedPlaceSuggestions(q);
        if (cached) { setSuggestions(cached); setFromCache(true); setIsSearching(false); return; }
        const res = await apiFetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}&session=${sessionToken.current}`);
        if (res.ok) {
          const data = await res.json() as any[];
          const results = Array.isArray(data) ? data : [];
          setSuggestions(results);
          await cachePlaceSuggestions(q, results);
        } else { setSuggestions([]); }
      } catch { setSuggestions([]); }
      finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.address, isLocationManuallyEdited]);

  const handleSuggestionSelect = async (suggestion: any) => {
    setFormData(prev => ({ ...prev, address: suggestion.description, google_place_id: suggestion.place_id }));
    setSuggestions([]);
    setIsLocationManuallyEdited(false);
    // Auto-fetch place details (coordinates + photo) on selection
    setIsSearching(true);
    try {
      const cached = await getCachedPlaceDetails(suggestion.place_id);
      if (cached) { applyPlaceDetails(cached); return; }
      const res = await apiFetch(`/api/places/details?placeId=${suggestion.place_id}&session=${sessionToken.current}`);
      if (res.ok) {
        const details = await res.json();
        await cachePlaceDetails(suggestion.place_id, details);
        applyPlaceDetails(details);
        sessionToken.current = Math.random().toString(36).substring(2);
      }
    } catch { /* silent */ }
    finally { setIsSearching(false); }
  };

  const handleFetchDetails = async () => {
    if (!formData.google_place_id) return;
    setIsSearching(true);
    try {
      const cached = await getCachedPlaceDetails(formData.google_place_id);
      if (cached) {
        applyPlaceDetails(cached);
        return;
      }
      const res = await apiFetch(`/api/places/details?placeId=${formData.google_place_id}&session=${sessionToken.current}`);
      if (res.ok) {
        const details = await res.json();
        await cachePlaceDetails(formData.google_place_id, details);
        applyPlaceDetails(details);
        sessionToken.current = Math.random().toString(36).substring(2);
      }
    } catch { alert('取得地點詳細資料失敗'); }
    finally { setIsSearching(false); }
  };

  const applyPlaceDetails = (details: any) => {
    if (details.location) {
      setFormData(prev => ({
        ...prev,
        lat: details.location.latitude,
        lng: details.location.longitude,
        image_url: details.actual_photo_url || prev.image_url,
        rating: details.rating || null,
        reviews_count: details.userRatingCount || null,
        opening_hours: details.regularOpeningHours ? JSON.stringify(details.regularOpeningHours) : '',
        place_website: details.websiteUri || '',
        place_phone: details.internationalPhoneNumber || '',
        place_status: details.businessStatus || ''
      }));
    }
  };

  useEffect(() => {
    if (storeCategories.length === 0) {
      apiFetch('/api/settings/categories').then(r => r.ok && r.json().then(setCategories)).catch(() => {});
    }
  }, [storeCategories, setCategories]);

  // 固定時間模式：start_time 改變時自動更新 end_time
  const handleStartTimeChange = (newStart: string) => {
    setFormData(prev => ({
      ...prev,
      start_time: newStart,
      end_time: isTimeFixed ? addMinutesToTime(newStart, fixedStayDuration) : prev.end_time
    }));
  };

  // 固定時間模式：停留時長滑桿改變 → 自動更新 end_time
  const handleFixedDurationChange = (mins: number) => {
    setFixedStayDuration(mins);
    if (formData.start_time) {
      setFormData(prev => ({ ...prev, end_time: addMinutesToTime(prev.start_time, mins) }));
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
    try { setFormData(prev => ({ ...prev, image_url: '' }));
      const url = await uploadImageToSupabase(blob, 'itineraries');
      setFormData(prev => ({ ...prev, image_url: url }));
    } catch { alert('圖片上傳失敗'); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/itineraries/${initialData.id}`, { method: 'DELETE' });
      if (res.ok) onSuccess();
    } catch { alert('刪除失敗'); }
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
        stay_duration: isTimeFixed ? fixedStayDuration.toString() : stayDuration.toString()
      };
      const res = await apiFetch(
        initialData ? `/api/trips/${tripId}/itineraries/${initialData.id}` : `/api/trips/${tripId}/itineraries`,
        { method: initialData ? 'PUT' : 'POST', body: JSON.stringify(payload) }
      );
      if (res.ok) onSuccess();
    } catch { setError('儲存活動失敗'); }
    finally { setLoading(false); }
  };

  const isKnownPlace = formData.google_place_id && knownPlaceIds.has(formData.google_place_id);

  return (
    <div className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col w-full max-w-md mx-auto shadow-2xl relative max-h-[90vh]">
      {/* 標頭 */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#1c1c1e]/90 backdrop-blur-md z-20 sticky top-0">
        <h2 className="text-lg font-bold text-white tracking-tight">{initialData ? '編輯活動' : '新增活動'}</h2>
        <button type="button" onClick={onCancel} className="p-1.5 bg-zinc-800/50 rounded-full text-zinc-400 hover:text-white"><X size={18} /></button>
      </div>

      <div className="overflow-y-auto px-5 py-5 space-y-5 pb-32 custom-scrollbar">
        {error && <div className="text-red-400 text-xs font-bold bg-red-500/10 p-3 rounded-xl">{error}</div>}

        {/* 圖示 / AI鎖 / 照片 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">類別</label>
            <button type="button" onClick={() => setIsIconPickerOpen(true)} className="h-12 bg-[#242426] border border-zinc-800 rounded-2xl flex items-center justify-center transition-all active:scale-95" style={{ color: (selectedCategory as any).color }}>
              <DynamicIcon name={formData.icon} size={22} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">AI 鎖定</label>
            <button type="button" onClick={() => setIsTimeFixed(!isTimeFixed)} className={clsx("h-12 border rounded-2xl flex items-center justify-center transition-all", isTimeFixed ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500")}>
              {isTimeFixed ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">照片</label>
            <button type="button" onClick={() => setIsPhotoModalOpen(true)} className={clsx("h-12 border rounded-2xl flex items-center justify-center overflow-hidden transition-all", formData.image_url ? "border-orange-500/50" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500")}>
              {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" alt="預覽" /> : <Camera size={20} />}
            </button>
          </div>
        </div>

        {/* 活動名稱 */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">活動名稱</label>
          <input type="text" required value={formData.title}
            onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white font-bold text-base focus:border-orange-500 outline-none transition-all"
            placeholder="活動名稱" />
        </div>

        {/* 排程模式 */}
        <div className="space-y-3 pt-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">排程模式</label>
          <div className="flex bg-zinc-900/80 p-1.5 rounded-2xl border border-zinc-800 shadow-inner">
            <button type="button" onClick={() => setIsTimeFixed(true)}
              className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${isTimeFixed ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>
              🔒 固定時間
            </button>
            <button type="button" onClick={() => setIsTimeFixed(false)}
              className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2 ${!isTimeFixed ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <Sparkles size={16} /> 智慧排程
            </button>
          </div>

          <AnimatePresence mode="wait">
            {isTimeFixed ? (
              <motion.div key="fixed" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                className="bg-[#242426] border border-zinc-800 p-4 rounded-2xl space-y-4">
                {/* 時間輸入 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col items-center bg-zinc-900/60 rounded-xl p-3">
                    <span className="text-[9px] text-zinc-500 mb-1 font-bold uppercase tracking-tighter">開始時間</span>
                    <input type="time" value={formData.start_time}
                      onChange={e => handleStartTimeChange(e.target.value)}
                      className="bg-transparent text-white font-mono font-bold text-base outline-none [color-scheme:dark]" />
                  </div>
                  <div className="flex flex-col items-center bg-zinc-900/60 rounded-xl p-3 border-l border-zinc-700/50">
                    <span className="text-[9px] text-zinc-500 mb-1 font-bold uppercase tracking-tighter">結束時間</span>
                    <input type="time" value={formData.end_time}
                      onChange={e => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                      className="bg-transparent text-white font-mono font-bold text-base outline-none [color-scheme:dark]" />
                  </div>
                </div>
                {/* 停留時長 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">停留時長</span>
                    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
                      <input type="number" min="0" max="480" value={fixedStayDuration}
                        onChange={e => handleFixedDurationChange(Math.min(480, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-10 bg-transparent text-white text-sm font-black text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <span className="text-[10px] text-zinc-500 font-bold">分</span>
                    </div>
                  </div>
                  <input type="range" min="0" max="480" step="5" value={fixedStayDuration}
                    onChange={e => handleFixedDurationChange(parseInt(e.target.value))}
                    className="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                  <div className="flex justify-between px-1 text-[9px] font-black text-zinc-600">
                    <span>0分</span><span>2時</span><span>4時</span><span>6時</span><span>8時</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="smart" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                className="bg-orange-500/5 p-5 rounded-2xl border border-orange-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">停留時長</label>
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
                    <input type="number" min="0" max="480" value={stayDuration}
                      onChange={e => setStayDuration(Math.min(480, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-10 bg-transparent text-white text-sm font-black text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span className="text-[10px] text-zinc-500 font-bold">分</span>
                  </div>
                </div>
                <input type="range" min="0" max="480" step="5" value={stayDuration}
                  onChange={e => setStayDuration(parseInt(e.target.value))}
                  className="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                <div className="flex justify-between px-1 text-[9px] font-black text-zinc-600">
                  <span>0分</span><span>2時</span><span>4時</span><span>6時</span><span>8時</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 地點位址 */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5 ml-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">地點位址</label>
            <div className="flex items-center gap-2">
              {fromCache && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 rounded-full border border-blue-500/20">
                  <Database size={8} className="text-blue-400" />
                  <span className="text-[8px] font-black text-blue-400 uppercase">快取</span>
                </div>
              )}
              {isKnownPlace && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 rounded-full border border-orange-500/20">
                  <Sparkles size={8} className="text-orange-500" />
                  <span className="text-[8px] font-black text-orange-500 uppercase">已收錄</span>
                </div>
              )}
              {formData.lat && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 rounded-full border border-green-500/20">
                  <MapPin size={8} className="text-green-500" />
                  <span className="text-[8px] font-black text-green-500 uppercase">GPS</span>
                </div>
              )}
            </div>
          </div>
          <div className="relative flex items-center">
            <MapPin size={16} className={clsx("absolute left-4 z-10 transition-colors",
              isSearching ? "text-orange-500 animate-pulse" : isKnownPlace ? "text-orange-400" : "text-zinc-500"
            )} />
            <input type="text" value={formData.address}
              onChange={e => { setFormData(prev => ({ ...prev, address: e.target.value })); setIsLocationManuallyEdited(true); }}
              className={clsx("w-full bg-[#242426] border rounded-2xl pl-11 pr-12 py-3.5 text-white text-xs focus:border-orange-500 outline-none transition-all",
                isKnownPlace ? "border-orange-500/40" : "border-zinc-800"
              )}
              placeholder="輸入地點名稱搜尋..." />
            <button type="button" onClick={handleFetchDetails} disabled={!formData.google_place_id}
              className={clsx("absolute right-2 p-1.5 rounded-xl transition-all",
                formData.google_place_id ? "bg-zinc-800 text-orange-500 hover:bg-orange-500 hover:text-white" : "text-zinc-700 cursor-not-allowed"
              )}>
              {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>

          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="absolute left-0 top-full z-[999] w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                  {suggestions.map((s, idx) => {
                    const isKnown = knownPlaceIds.has(s.place_id);
                    return (
                      <button key={idx} type="button" onClick={() => handleSuggestionSelect(s)}
                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-zinc-800 text-left border-b border-zinc-800/50 last:border-0 group">
                        <MapPin size={14} className={clsx("mt-0.5 shrink-0 transition-colors", isKnown ? "text-orange-500" : "text-zinc-600 group-hover:text-orange-500")} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                            {s.structured_formatting.main_text}
                            {isKnown && (
                              <span className="inline-flex items-center gap-0.5 bg-orange-500/15 text-orange-400 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-orange-500/20 shrink-0">
                                ⚡ 已收錄
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">{s.structured_formatting.secondary_text}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 標籤 */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">標籤</label>
          <div className="bg-[#242426] border border-zinc-800 rounded-2xl p-2 flex flex-wrap gap-2 items-center">
            {formData.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
              <span key={tag} className="bg-orange-500/10 text-orange-500 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5">
                {tag}
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, tags: prev.tags.split(',').map(t => t.trim()).filter(t => t !== tag).join(', ') }))} className="hover:text-white transition-colors"><X size={10} /></button>
              </span>
            ))}
            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = tagInput.trim(); if (v) { const cur = formData.tags ? formData.tags.split(',').map(t => t.trim()) : []; if (!cur.includes(v)) setFormData(prev => ({ ...prev, tags: [...cur, v].join(', ') })); setTagInput(''); } } }}
              className="flex-1 bg-transparent border-none outline-none text-white text-xs px-1 min-w-[80px]" placeholder="+ 新增標籤" />
          </div>
        </div>

        {/* 子活動 */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">子活動</label>
            <button type="button" onClick={() => { setEditingSubItem(null); setIsSubItemModalOpen(true); }}
              className="text-[10px] text-orange-500 font-bold px-2.5 py-1 bg-orange-500/10 rounded-lg hover:bg-orange-500/20 transition-all">+ 新增</button>
          </div>
          {!isTimeFixed && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Sparkles size={10} className="text-orange-500" />
              <span className="text-[9px] text-orange-500/70 font-bold">智慧排程模式：子活動時間將隨主活動自動調整</span>
            </div>
          )}
          <div className="space-y-2">
            {subItems.length > 0 ? subItems.map((item, idx) => (
              <div key={idx} onClick={() => { setEditingSubItem(item); setIsSubItemModalOpen(true); }}
                className="bg-[#242426] border border-zinc-800 p-3 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-zinc-600 transition-all shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                  <div>
                    <div className="text-xs font-bold text-white">{item.title}</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{item.start_time} — {item.end_time}</div>
                  </div>
                </div>
                <button type="button" onClick={e => { e.stopPropagation(); setSubItems(subItems.filter((_, i) => i !== idx)); }}
                  className="p-2 text-zinc-600 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
              </div>
            )) : (
              <div className="text-center py-6 border border-dashed border-zinc-800/50 rounded-2xl text-zinc-600 text-[10px] uppercase font-bold tracking-[0.2em]">尚無子活動</div>
            )}
          </div>
        </div>

        {/* 備註 */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">備註</label>
          <textarea value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white text-xs focus:border-orange-500 outline-none min-h-[90px] resize-none transition-all"
            placeholder="任何備注資訊..." />
        </div>

        {initialData && (
          <div className="pt-4 border-t border-zinc-800">
            <button type="button" onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 border border-red-500/20">
              <Trash2 size={18} />刪除活動
            </button>
          </div>
        )}
      </div>

      {/* 底部按鈕 */}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-[#1c1c1e] border-t border-zinc-800 flex gap-3 z-20">
        <button type="button" onClick={onCancel} className="flex-1 py-4 rounded-2xl font-bold text-zinc-500 text-sm hover:bg-zinc-800 transition-colors">取消</button>
        <button type="submit" disabled={loading || uploading} onClick={handleSubmit}
          className="flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all">
          {loading ? <Loader2 size={18} className="animate-spin" /> : (initialData ? '更新行程' : '加入行程')}
        </button>
      </div>

      {/* 刪除確認 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-2">刪除活動？</h3>
              <p className="text-zinc-400 mb-6">確定要刪除此活動嗎？此操作無法復原。</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">取消</button>
                <button type="button" onClick={handleDelete} disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors flex justify-center items-center gap-2">
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : '刪除'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 照片管理 */}
      <AnimatePresence>
        {isPhotoModalOpen && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-[40px] w-full max-w-sm overflow-hidden flex flex-col shadow-2xl">
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                <span className="text-xs font-black text-white uppercase tracking-widest">活動照片</span>
                <button type="button" onClick={() => setIsPhotoModalOpen(false)}><X size={20} className="text-zinc-500" /></button>
              </div>
              <div className="p-6 flex flex-col items-center gap-4">
                {/* 點擊框架即可上傳 */}
                <label className="w-full aspect-[21/9] rounded-[28px] bg-zinc-950 border-2 border-dashed border-zinc-700 overflow-hidden relative shadow-inner cursor-pointer hover:border-orange-500/50 transition-colors group">
                  {formData.image_url ? (
                    <img src={formData.image_url} className="w-full h-full object-cover" alt="預覽" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2 group-hover:text-zinc-400 transition-colors">
                      <Upload size={32} strokeWidth={1.5} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">點擊上傳照片</span>
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                      <Loader2 className="animate-spin text-orange-500" size={32} />
                    </div>
                  )}
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={uploading} />
                </label>

                <div className="flex w-full gap-3">
                  {formData.image_url ? (
                    <>
                      <button type="button" onClick={() => setIsPhotoModalOpen(false)}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all">
                        <Check size={16} /> 完成
                      </button>
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                        className="w-14 flex items-center justify-center bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-colors border border-red-500/20">
                        <Trash2 size={18} />
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setIsPhotoModalOpen(false)}
                      className="flex-1 py-4 bg-zinc-800 text-zinc-400 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-zinc-700 transition-colors">
                      取消
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 圖片裁切 */}
      <AnimatePresence>
        {croppingImage && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-md flex justify-between items-center mb-4 px-2">
              <span className="text-white font-black tracking-widest uppercase text-sm">裁切圖片</span>
              <button type="button" onClick={() => setCroppingImage(null)} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="w-full max-w-md h-[60vh] relative bg-zinc-950 rounded-[32px] overflow-hidden shadow-2xl border border-zinc-800">
              <ImageCropper imageSrc={croppingImage} aspect={21/9} onCropComplete={handleCropComplete} onCancel={() => setCroppingImage(null)} />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 類別選擇 */}
      <AnimatePresence>
        {isIconPickerOpen && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full p-6 shadow-2xl flex flex-col max-h-[60vh]">
              <div className="flex justify-between items-center mb-6 px-1">
                <h3 className="font-black text-white text-base tracking-tight">選擇類別</h3>
                <button type="button" onClick={() => setIsIconPickerOpen(false)} className="text-zinc-500 p-1.5 bg-zinc-800 rounded-full"><X size={16} /></button>
              </div>
              <div className="overflow-y-auto grid grid-cols-4 gap-3 pb-8 custom-scrollbar">
                {storeCategories.map((cat: any) => (
                  <button type="button" key={cat.id}
                    onClick={() => { setFormData(prev => ({ ...prev, icon: cat.icon })); setIsIconPickerOpen(false); }}
                    className={clsx("flex flex-col items-center justify-center p-3.5 rounded-3xl transition-all border",
                      formData.icon === cat.icon ? "border-white/20 bg-white/5 shadow-inner" : "border-transparent hover:bg-white/5"
                    )} style={{ color: cat.color }}>
                    <DynamicIcon name={cat.icon} size={24} />
                    <span className="text-[9px] font-bold mt-2 text-zinc-400 truncate w-full text-center uppercase tracking-tighter">{cat.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 子活動 Modal */}
      <AnimatePresence>
        {isSubItemModalOpen && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-[28px] w-full max-w-[320px] p-6 shadow-3xl">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-white text-sm tracking-tight">子活動</h3>
                <button type="button" onClick={() => setIsSubItemModalOpen(false)}><X size={18} className="text-zinc-500" /></button>
              </div>
              {formData.start_time && formData.end_time && (
                <div className="mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800 text-[10px] text-zinc-400 flex items-center gap-1.5">
                  <Lock size={10} className="text-orange-500" />
                  <span>時間限制：{formData.start_time} — {formData.end_time}</span>
                </div>
              )}
              <form onSubmit={e => {
                e.preventDefault();
                const f = e.target as any;
                const st = f.start_time.value;
                const et = f.end_time.value;
                if (formData.start_time && st < formData.start_time) { alert(`子活動開始時間不可早於主活動 ${formData.start_time}`); return; }
                if (formData.end_time && et > formData.end_time) { alert(`子活動結束時間不可晚於主活動 ${formData.end_time}`); return; }
                if (st >= et) { alert('結束時間必須晚於開始時間'); return; }
                const newItem = { id: editingSubItem?.id || Date.now().toString(), title: f.title.value, start_time: st, end_time: et, notes: f.notes.value };
                if (editingSubItem) setSubItems(subItems.map(i => i.id === editingSubItem.id ? newItem : i));
                else setSubItems([...subItems, newItem].sort((a, b) => a.start_time.localeCompare(b.start_time)));
                setIsSubItemModalOpen(false);
              }} className="space-y-4">
                <input type="text" name="title" required defaultValue={editingSubItem?.title} placeholder="子活動名稱"
                  className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-xs outline-none focus:border-orange-500 transition-all" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2">
                    <span className="block text-[8px] text-zinc-500 font-bold mb-1">開始</span>
                    <input type="time" name="start_time" required
                      defaultValue={editingSubItem?.start_time || formData.start_time}
                      min={formData.start_time || undefined}
                      max={formData.end_time || undefined}
                      className="bg-transparent text-white font-mono text-xs w-full outline-none [color-scheme:dark]" />
                  </div>
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2">
                    <span className="block text-[8px] text-zinc-500 font-bold mb-1">結束</span>
                    <input type="time" name="end_time" required
                      defaultValue={editingSubItem?.end_time || formData.end_time}
                      min={formData.start_time || undefined}
                      max={formData.end_time || undefined}
                      className="bg-transparent text-white font-mono text-xs w-full outline-none [color-scheme:dark]" />
                  </div>
                </div>
                <textarea name="notes" defaultValue={editingSubItem?.notes} placeholder="備注..."
                  className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-xs outline-none min-h-[60px] focus:border-orange-500 transition-all" />
                <button type="submit" className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all">儲存子活動</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <LocationPicker
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        groupedCities={groupedCities}
        onSelect={loc => {
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
