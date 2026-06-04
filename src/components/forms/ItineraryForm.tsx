import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../../store';
import { X, MapPin, Loader2, Trash2, Camera, Image as ImageIcon, Upload, Sparkles, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../../utils/api';
import { DynamicIcon } from '../common/DynamicIcon';
import { ImageCropper, uploadImageToSupabase } from '../widgets/ImageCropper';
import { LocationPicker } from '../pickers/LocationPicker';
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
  try { const p = JSON.parse(data); return Array.isArray(p) ? p : []; } catch { return []; }
};

// ── 時間輸入（手機數字鍵盤）─────────────────────────────────────────
const TimeInput = ({ value, onChange, placeholder = 'HH:MM', className }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; className?: string;
}) => (
  <input
    type="text"
    inputMode="numeric"
    pattern="[0-9:]*"
    value={value}
    onChange={e => {
      const d = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
      onChange(d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d);
    }}
    onBlur={e => {
      const parts = e.target.value.split(':');
      if (parts.length === 2 && parts[0] && parts[1]) {
        const h = Math.min(23, parseInt(parts[0]) || 0);
        const m = Math.min(59, parseInt(parts[1]) || 0);
        onChange(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }}
    placeholder={placeholder}
    className={className}
  />
);

const timeToMins = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minsToTime = (mins: number) => {
  const h = Math.floor(Math.max(0, mins) / 60) % 24;
  const m = Math.max(0, mins) % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
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
  const [editingSubItem, setEditingSubItem] = useState<any>(null);

  // 子行程表單 state
  const [subTitle, setSubTitle] = useState('');
  const [subStartTime, setSubStartTime] = useState('');
  const [subEndTime, setSubEndTime] = useState('');
  const [subNotes, setSubNotes] = useState('');
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [subItems, setSubItems] = useState<any[]>(safeParseArray(initialData?.sub_items));

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const sessionToken = useRef(Math.random().toString(36).substring(2));
  const [isLocationManuallyEdited, setIsLocationManuallyEdited] = useState(false);

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

  const selectedCategory = storeCategories.find(c => c.icon === formData.icon) || { color: '#808080', icon: 'MapPin' };

  // ── 時間同步邏輯 ────────────────────────────────────────────────────
  const syncEndTime = (startTime: string, duration: number) => {
    if (startTime.includes(':') && startTime.length >= 5) {
      return minsToTime(timeToMins(startTime) + duration);
    }
    return formData.end_time;
  };

  const handleStartTimeChange = (val: string) => {
    setFormData(prev => ({
      ...prev,
      start_time: val,
      ...(isTimeFixed && val.includes(':') && val.length >= 5 && stayDuration > 0
        ? { end_time: syncEndTime(val, stayDuration) }
        : {})
    }));
  };

  const handleEndTimeChange = (val: string) => {
    setFormData(prev => ({ ...prev, end_time: val }));
    if (val.includes(':') && val.length >= 5 && formData.start_time.includes(':')) {
      const diff = timeToMins(val) - timeToMins(formData.start_time);
      if (diff > 0) setStayDuration(diff);
    }
  };

  const handleStayDurationChange = (mins: number) => {
    setStayDuration(mins);
    if (formData.start_time.includes(':') && formData.start_time.length >= 5) {
      setFormData(prev => ({ ...prev, end_time: minsToTime(timeToMins(prev.start_time) + mins) }));
    }
  };

  // ── Autocomplete ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      if (isLocationManuallyEdited && formData.address.length > 1) {
        setIsSearching(true);
        try {
          const res = await apiFetch(`/api/places/autocomplete?q=${encodeURIComponent(formData.address)}&session=${sessionToken.current}`);
          if (res.ok) {
            const data = await res.json();
            setSuggestions(Array.isArray(data) ? data : []);
          } else {
            setSuggestions([]);
          }
        } catch { setSuggestions([]); }
        finally { setIsSearching(false); }
      } else {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [formData.address, isLocationManuallyEdited]);

  const handleSuggestionSelect = (s: any) => {
    setFormData(prev => ({ ...prev, address: s.description, google_place_id: s.place_id }));
    setSuggestions([]);
    setIsLocationManuallyEdited(false);
  };

  const handleFetchDetails = async () => {
    if (!formData.google_place_id) return;
    setIsSearching(true);
    try {
      const res = await apiFetch(`/api/places/details?placeId=${formData.google_place_id}&session=${sessionToken.current}`);
      if (res.ok) {
        const d = await res.json();
        if (d.location) {
          setFormData(prev => ({
            ...prev,
            lat: d.location.latitude, lng: d.location.longitude,
            image_url: d.actual_photo_url || prev.image_url,
            rating: d.rating || null, reviews_count: d.userRatingCount || null,
            opening_hours: d.regularOpeningHours ? JSON.stringify(d.regularOpeningHours) : '',
            place_website: d.websiteUri || '', place_phone: d.internationalPhoneNumber || '',
          }));
          sessionToken.current = Math.random().toString(36).substring(2);
          alert('地點資訊已同步！✅');
        }
      }
    } catch { alert('無法取得地點詳細資訊'); }
    finally { setIsSearching(false); }
  };

  useEffect(() => {
    if (storeCategories.length === 0) {
      apiFetch('/api/settings/categories').then(res => { if (res.ok) res.json().then(setCategories); });
    }
  }, [storeCategories, setCategories]);

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
    } catch { alert('上傳失敗'); }
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
        trip_id: tripId, date,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        sub_items: JSON.stringify(subItems),
        is_time_fixed: isTimeFixed ? 1 : 0,
        stay_duration: stayDuration.toString()
      };
      const res = await apiFetch(
        initialData ? `/api/trips/${tripId}/itineraries/${initialData.id}` : `/api/trips/${tripId}/itineraries`,
        { method: initialData ? 'PUT' : 'POST', body: JSON.stringify(payload) }
      );
      if (res.ok) onSuccess();
    } catch { setError('儲存失敗，請再試一次'); }
    finally { setLoading(false); }
  };

  const durationLabel = (mins: number) => {
    if (mins < 60) return `${mins} 分`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h} 小時`;
  };

  return (
    <div className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col w-full max-w-md mx-auto shadow-2xl relative max-h-[90vh]">

      {/* ── 頂部 header ─────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-[#1c1c1e]/95 backdrop-blur-md z-20 sticky top-0 shrink-0">
        <h2 className="text-sm font-black text-white uppercase tracking-widest">
          {initialData ? '編輯活動' : '新增活動'}
        </h2>
        <button type="button" onClick={onCancel} className="p-1.5 bg-zinc-800/60 rounded-full text-zinc-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* ── 可捲動內容 ──────────────────────────────────────────────── */}
      <div className="overflow-y-auto px-5 py-5 space-y-5 pb-28 custom-scrollbar flex-1">
        {error && <div className="text-red-400 text-xs font-bold bg-red-500/10 p-2.5 rounded-xl">{error}</div>}

        {/* ─ 活動照片 & 名稱 ─ */}
        <div className="space-y-3">
          {/* 照片預覽區 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPhotoModalOpen(true)}
              className={clsx(
                'w-full h-28 rounded-2xl overflow-hidden border flex items-center justify-center transition-all',
                formData.image_url ? 'border-zinc-700' : 'border-dashed border-zinc-700 bg-zinc-900/50 text-zinc-600 hover:border-zinc-500'
              )}
            >
              {formData.image_url
                ? <img src={formData.image_url} className="w-full h-full object-cover" alt="預覽" />
                : <div className="flex flex-col items-center gap-1.5"><Camera size={22} /><span className="text-[10px] font-bold uppercase tracking-widest">新增照片</span></div>
              }
              {uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" size={24} /></div>}
            </button>
            {/* 圖示選擇按鈕（疊在照片上） */}
            <button
              type="button"
              onClick={() => setIsIconPickerOpen(true)}
              className="absolute bottom-2.5 left-2.5 w-10 h-10 rounded-xl bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center transition-all active:scale-95"
              style={{ color: (selectedCategory as any).color }}
            >
              <DynamicIcon name={formData.icon} size={20} />
            </button>
          </div>

          {/* 活動名稱 */}
          <input
            type="text"
            required
            value={formData.title}
            onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="活動名稱"
            className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white font-bold text-base focus:border-orange-500 outline-none placeholder:text-zinc-600"
          />
        </div>

        {/* ─ 時間模式 ─ */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">時間模式</label>
          <div className="flex bg-zinc-900/60 p-1 rounded-2xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setIsTimeFixed(true)}
              className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${isTimeFixed ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              固定時間
            </button>
            <button
              type="button"
              onClick={() => setIsTimeFixed(false)}
              className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${!isTimeFixed ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Sparkles size={14} />智慧排程
            </button>
          </div>

          <AnimatePresence mode="wait">
            {isTimeFixed ? (
              <motion.div key="fixed" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="bg-[#242426] border border-zinc-800 rounded-2xl p-4 space-y-4">
                {/* 開始 / 停留 / 結束 */}
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter block">開始時間</span>
                    <TimeInput
                      value={formData.start_time}
                      onChange={handleStartTimeChange}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-white font-mono font-bold text-sm text-center outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-orange-500 font-bold uppercase tracking-tighter block text-center">停留時間</span>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-2 py-2 text-center">
                      <span className="text-xs font-black text-orange-400">{durationLabel(stayDuration)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter block">結束時間</span>
                    <TimeInput
                      value={formData.end_time}
                      onChange={handleEndTimeChange}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-white font-mono font-bold text-sm text-center outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* 停留時間滑桿 */}
                <div className="space-y-2">
                  <input
                    type="range" min="0" max="480" step="5"
                    value={stayDuration}
                    onChange={e => handleStayDurationChange(parseInt(e.target.value))}
                    className="w-full accent-orange-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer outline-none appearance-none"
                  />
                  <div className="flex justify-between px-0.5 text-[9px] font-black text-zinc-600 uppercase">
                    <span>0m</span><span>1h</span><span>2h</span><span>4h</span><span>8h</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="smart" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">停留時間</span>
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
                    <input
                      type="number" min="0" max="480"
                      value={stayDuration}
                      onChange={e => setStayDuration(Math.min(480, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-10 bg-transparent text-white text-sm font-black text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-zinc-500 font-bold">MIN</span>
                  </div>
                </div>
                <input
                  type="range" min="0" max="480" step="5"
                  value={stayDuration}
                  onChange={e => setStayDuration(parseInt(e.target.value))}
                  className="w-full accent-orange-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer appearance-none outline-none"
                />
                <div className="flex justify-between px-0.5 text-[9px] font-black text-zinc-600 uppercase">
                  <span>0m</span><span>1h</span><span>2h</span><span>4h</span><span>8h</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─ 位置地址 ─ */}
        <div className="space-y-1.5 relative">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">位置地址</label>
            {formData.lat && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 rounded-full border border-green-500/20">
                <Sparkles size={8} className="text-green-500" />
                <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">GPS 已取得</span>
              </div>
            )}
          </div>
          <div className="relative flex items-center">
            <MapPin size={15} className={clsx('absolute left-3.5 z-10 transition-colors', isSearching ? 'text-orange-500 animate-pulse' : 'text-zinc-600')} />
            <input
              type="text"
              value={formData.address}
              onChange={e => { setFormData(prev => ({ ...prev, address: e.target.value })); setIsLocationManuallyEdited(true); }}
              className="w-full bg-[#242426] border border-zinc-800 rounded-2xl pl-10 pr-11 py-3 text-white text-sm focus:border-orange-500 outline-none placeholder:text-zinc-600"
              placeholder="搜尋地點..."
            />
            <button
              type="button"
              onClick={handleFetchDetails}
              disabled={!formData.google_place_id}
              className={clsx('absolute right-2.5 p-1.5 rounded-xl transition-all', formData.google_place_id ? 'bg-zinc-800 text-orange-500 hover:bg-orange-500 hover:text-white' : 'text-zinc-700 cursor-not-allowed')}
            >
              {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            </button>
          </div>
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="absolute left-0 top-full z-[999] w-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="max-h-[180px] overflow-y-auto custom-scrollbar">
                  {suggestions.map((s, i) => (
                    <button key={i} type="button" onClick={() => handleSuggestionSelect(s)}
                      className="w-full px-4 py-2.5 flex items-start gap-2.5 hover:bg-zinc-800 text-left border-b border-zinc-800/50 last:border-0 group">
                      <MapPin size={13} className="mt-0.5 text-zinc-600 group-hover:text-orange-500 shrink-0" />
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

        {/* ─ 子行程 ─ */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">子行程</label>
            <button type="button" onClick={() => {
                setEditingSubItem(null); setSubTitle(''); setSubStartTime(formData.start_time); setSubEndTime(formData.end_time); setSubNotes('');
                setIsSubItemModalOpen(true);
              }}
              className="text-[10px] text-orange-500 font-bold px-2.5 py-1 bg-orange-500/10 rounded-lg hover:bg-orange-500/20 transition-all">
              + 新增
            </button>
          </div>
          {subItems.length > 0 ? subItems.map((item, idx) => (
            <div key={idx} onClick={() => { setEditingSubItem(item); setSubTitle(item.title); setSubStartTime(item.start_time); setSubEndTime(item.end_time); setSubNotes(item.notes || ''); setIsSubItemModalOpen(true); }}
              className="bg-[#242426] border border-zinc-800 p-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-zinc-600 transition-all">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.5)]" />
                <div>
                  <div className="text-xs font-bold text-white">{item.title}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{item.start_time} — {item.end_time}</div>
                </div>
              </div>
              <button type="button" onClick={e => { e.stopPropagation(); setSubItems(subItems.filter((_, i) => i !== idx)); }}
                className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          )) : (
            <div className="text-center py-5 border border-dashed border-zinc-800/50 rounded-xl text-zinc-600 text-[10px] uppercase font-bold tracking-widest">無子行程</div>
          )}
        </div>

        {/* ─ 標籤 ─ */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">標籤</label>
          <div className="bg-[#242426] border border-zinc-800 rounded-2xl p-2.5 flex flex-wrap gap-2 items-center min-h-[44px]">
            {formData.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
              <span key={tag} className="bg-orange-500/10 text-orange-400 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                {tag}
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, tags: prev.tags.split(',').map(t => t.trim()).filter(t => t !== tag).join(', ') }))}
                  className="hover:text-white"><X size={9} /></button>
              </span>
            ))}
            <input
              type="text" value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = tagInput.trim();
                  if (val) {
                    const cur = formData.tags ? formData.tags.split(',').map(t => t.trim()) : [];
                    if (!cur.includes(val)) setFormData(prev => ({ ...prev, tags: [...cur, val].join(', ') }));
                    setTagInput('');
                  }
                }
              }}
              className="flex-1 bg-transparent border-none outline-none text-white text-xs px-1 min-w-[80px] placeholder:text-zinc-600"
              placeholder="+ 新增標籤"
            />
          </div>
        </div>

        {/* ─ 備註 ─ */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">備註</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white text-sm focus:border-orange-500 outline-none min-h-[90px] resize-none placeholder:text-zinc-600"
            placeholder="特別備註..."
          />
        </div>

        {/* ─ 刪除 ─ */}
        {initialData && (
          <div className="pt-2 border-t border-zinc-800">
            <button type="button" onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 border border-red-500/20 text-sm">
              <Trash2 size={16} />刪除活動
            </button>
          </div>
        )}
      </div>

      {/* ── 底部 footer（sticky）──────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#1c1c1e]/95 backdrop-blur-md border-t border-zinc-800/80 flex gap-3 z-20">
        <button type="button" onClick={onCancel}
          className="flex-1 py-3.5 rounded-2xl font-bold text-zinc-500 text-sm hover:bg-zinc-800 transition-colors border border-zinc-800">
          取消
        </button>
        <button type="submit" disabled={loading || uploading} onClick={handleSubmit}
          className="flex-[2] py-3.5 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
          {loading ? <Loader2 size={18} className="animate-spin" /> : (initialData ? '更新行程' : '新增行程')}
        </button>
      </div>

      {/* ── Modals ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-2">刪除活動？</h3>
              <p className="text-zinc-400 mb-6 text-sm">確定要刪除這個活動嗎？此操作無法復原。</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">取消</button>
                <button type="button" onClick={handleDelete} disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors flex justify-center items-center gap-2">
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : '刪除'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 照片管理 */}
      <AnimatePresence>
        {isPhotoModalOpen && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-5">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                <span className="text-sm font-black text-white uppercase tracking-widest">活動照片</span>
                <button type="button" onClick={() => setIsPhotoModalOpen(false)} className="p-1.5 text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="p-5 flex flex-col items-center gap-4">
                <div className="w-full aspect-[21/9] rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden relative">
                  {formData.image_url
                    ? <img src={formData.image_url} className="w-full h-full object-cover" alt="照片" />
                    : <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 gap-2"><ImageIcon size={40} strokeWidth={1} /><span className="text-[10px] font-bold uppercase tracking-widest">尚未設定照片</span></div>
                  }
                </div>
                <div className="flex w-full gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white text-black rounded-2xl font-black text-xs uppercase cursor-pointer hover:bg-zinc-200 transition-colors">
                    <Upload size={15} />上傳照片
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                  </label>
                  {formData.image_url && (
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                      className="w-14 flex items-center justify-center bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-colors">
                      <Trash2 size={18} />
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
          <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md flex justify-between items-center mb-4 px-2">
              <span className="text-white font-black tracking-widest uppercase text-sm">裁切圖片</span>
              <button type="button" onClick={() => setCroppingImage(null)} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="w-full max-w-md h-[55vh] relative bg-zinc-950 rounded-[28px] overflow-hidden shadow-2xl border border-zinc-800">
              <ImageCropper image={croppingImage} aspect={21 / 9} onCropComplete={handleCropComplete} onCancel={() => setCroppingImage(null)} />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 類別選擇 */}
      <AnimatePresence>
        {isIconPickerOpen && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-[28px] w-full p-5 shadow-2xl flex flex-col max-h-[60vh]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-white text-sm uppercase tracking-widest">選擇分類</h3>
                <button type="button" onClick={() => setIsIconPickerOpen(false)} className="text-zinc-500 p-1.5 bg-zinc-800 rounded-full"><X size={15} /></button>
              </div>
              <div className="overflow-y-auto grid grid-cols-4 gap-2.5 pb-4 custom-scrollbar">
                {storeCategories.map(cat => (
                  <button key={cat.id} type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, icon: cat.icon })); setIsIconPickerOpen(false); }}
                    className={clsx('flex flex-col items-center p-3 rounded-2xl transition-all border', formData.icon === cat.icon ? 'border-white/20 bg-white/5' : 'border-transparent hover:bg-white/5')}
                    style={{ color: cat.color }}
                  >
                    <DynamicIcon name={cat.icon} size={22} />
                    <span className="text-[9px] font-bold mt-1.5 text-zinc-400 truncate w-full text-center uppercase tracking-tight">{cat.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 子行程 Modal */}
      <AnimatePresence>
        {isSubItemModalOpen && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-[24px] w-full max-w-xs p-5 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white text-sm uppercase tracking-widest">子行程</h3>
                <button type="button" onClick={() => setIsSubItemModalOpen(false)}><X size={17} className="text-zinc-500" /></button>
              </div>
              <div className="space-y-3.5">
                <input type="text" required value={subTitle} onChange={e => setSubTitle(e.target.value)}
                  placeholder="子行程名稱"
                  className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-orange-500" />
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2.5">
                    <span className="block text-[9px] text-zinc-500 font-bold mb-1 uppercase">開始</span>
                    <TimeInput value={subStartTime} onChange={setSubStartTime}
                      className="w-full bg-transparent text-white font-mono text-sm outline-none" />
                  </div>
                  <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2.5">
                    <span className="block text-[9px] text-zinc-500 font-bold mb-1 uppercase">結束</span>
                    <TimeInput value={subEndTime} onChange={setSubEndTime}
                      className="w-full bg-transparent text-white font-mono text-sm outline-none" />
                  </div>
                </div>
                <textarea value={subNotes} onChange={e => setSubNotes(e.target.value)}
                  placeholder="備註..."
                  className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none min-h-[60px] focus:border-orange-500" />
                <button
                  type="button"
                  disabled={!subTitle}
                  onClick={() => {
                    const newItem = { id: editingSubItem?.id || Date.now().toString(), title: subTitle, start_time: subStartTime, end_time: subEndTime, notes: subNotes };
                    if (editingSubItem) setSubItems(subItems.map(i => i.id === editingSubItem.id ? newItem : i));
                    else setSubItems([...subItems, newItem].sort((a, b) => a.start_time.localeCompare(b.start_time)));
                    setIsSubItemModalOpen(false);
                  }}
                  className="w-full py-3 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50">
                  儲存子行程
                </button>
              </div>
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
