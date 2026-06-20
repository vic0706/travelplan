import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../../store';
import { X, MapPin, Loader2, Plus, Trash2, Camera, Upload, Sparkles, Lock, Unlock, Check, AlertTriangle, Footprints } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../../utils/api';
import { DynamicIcon } from '../common/DynamicIcon';
import { ImageCropper, uploadImageToSupabase } from '../widgets/ImageCropper';
import { LocationPicker } from '../pickers/LocationPicker';
import { AddressSearchInput } from '../inputs/AddressSearchInput';
import { clsx } from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getCachedPlaceSuggestions, cachePlaceSuggestions, getCachedPlaceDetails, cachePlaceDetails } from '../../db';

interface ItineraryFormProps {
  tripId: number;
  date: string;
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
  showToast?: (message: string, type?: 'success' | 'error') => void;
  backupForId?: number;
  backupForTitle?: string;
  backupPrimaryItem?: any;
  onAddBackup?: () => void;
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

export function ItineraryForm({ tripId, date, onSuccess, onCancel, initialData, showToast, backupForId, backupForTitle, backupPrimaryItem, onAddBackup }: ItineraryFormProps) {
  const { categories: storeCategories = [], setCategories, cities: storeCities = [] } = useAppStore();

  const groupedCities = useMemo(() => storeCities.reduce((acc: any, city: any) => {
    const country = city.country || 'Others';
    if (!acc[country]) acc[country] = [];
    acc[country].push(city);
    return acc;
  }, {}), [storeCities]);

  const [isTimeFixed, setIsTimeFixed] = useState(
    initialData?.is_time_fixed === 1 ||
    (backupForId != null && backupPrimaryItem?.is_time_fixed === 1)
  );
  const [stayDuration, setStayDuration] = useState(() => {
    if (initialData?.stay_duration) return parseInt(initialData.stay_duration);
    if (backupForId != null && backupPrimaryItem?.stay_duration) return parseInt(backupPrimaryItem.stay_duration);
    return 60;
  });
  const [fixedStayDuration, setFixedStayDuration] = useState(() => {
    if (initialData?.start_time && initialData?.end_time) {
      return timeToMinutes(initialData.start_time, initialData.end_time);
    }
    if (backupForId != null && backupPrimaryItem?.start_time && backupPrimaryItem?.end_time) {
      return timeToMinutes(backupPrimaryItem.start_time, backupPrimaryItem.end_time);
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
  const [isSearching, setIsSearching] = useState(false);
  const sessionToken = useRef(Math.random().toString(36).substring(2));

  // Live-query: google_place_ids in THIS trip — checks both itineraries and bookings
  const knownPlaceIds = useLiveQuery(
    async () => {
      const [itinItems, bookingItems] = await Promise.all([
        db.itineraries.where('trip_id').equals(tripId).toArray(),
        db.bookings.where('trip_id').equals(tripId).toArray(),
      ]);
      const ids = new Set<string>();
      for (const item of [...itinItems, ...bookingItems]) {
        const pid = (item as any).google_place_id;
        if (pid) ids.add(pid);
      }
      return ids;
    },
    [tripId],
    new Set<string>()
  ) ?? new Set<string>();

  const [editingSubItem, setEditingSubItem] = useState<any>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [subItems, setSubItems] = useState<any[]>(safeParseArray(initialData?.sub_items));
  const [subAddress, setSubAddress] = useState('');
  const [subLat, setSubLat] = useState<number | null>(null);
  const [subLng, setSubLng] = useState<number | null>(null);
  const [subTitle, setSubTitle] = useState('');
  const [subIsAddrEdited, setSubIsAddrEdited] = useState(false);
  const [subDuration, setSubDuration] = useState(30);
  const [subStartTime, setSubStartTime] = useState('');
  const [subEndTime, setSubEndTime] = useState('');
  const [subSaving, setSubSaving] = useState(false);
  const [subNextWalkMins, setSubNextWalkMins] = useState(0);
  const [subWalkAuto, setSubWalkAuto] = useState(true);
  const [subWalkEstimate, setSubWalkEstimate] = useState(0);
  const [showDurationWarn, setShowDurationWarn] = useState(false);
  const [durationWarnInfo, setDurationWarnInfo] = useState({ total: 0, parent: 0 });
  const [pendingSaveItem, setPendingSaveItem] = useState<any>(null);

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    address: initialData?.address || '',
    start_time: initialData?.start_time || (backupForId != null ? (backupPrimaryItem?.start_time ?? '') : ''),
    end_time: initialData?.end_time || (backupForId != null ? (backupPrimaryItem?.end_time ?? '') : ''),
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
    review_summary: initialData?.review_summary || '',
    place_status: initialData?.place_status || '',
    next_transport_mode: initialData?.next_transport_mode || '',
    next_transport_time: initialData?.next_transport_time || '',
    next_transport_auto_time: initialData?.next_transport_auto_time || ''
  });

  const [isLocationManuallyEdited, setIsLocationManuallyEdited] = useState(false);
  const selectedCategory = storeCategories.find((c: any) => c.icon === formData.icon) || { color: '#808080', icon: 'MapPin' };

  // Auto-fill transport mode from most common mode in this trip (only for new items)
  useEffect(() => {
    if (initialData) return;
    apiFetch(`/api/trips/${tripId}/itineraries`)
      .then(r => r.ok ? r.json() : [])
      .then((items: any[]) => {
        const counts: Record<string, number> = {};
        for (const i of items) {
          if (i.next_transport_mode) counts[i.next_transport_mode] = (counts[i.next_transport_mode] || 0) + 1;
        }
        const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'DRIVING';
        setFormData(prev => ({
          ...prev,
          next_transport_mode: prev.next_transport_mode || mostCommon,
          next_transport_time: prev.next_transport_time || 'auto',
        }));
      })
      .catch(() => {});
  }, [tripId, initialData]);

  // 標題同步到地址欄（新增模式）
  useEffect(() => {
    if (!initialData && !isLocationManuallyEdited && !formData.google_place_id) {
      setFormData(prev => ({ ...prev, address: prev.title }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.title]);

  // 子活動 Modal 開啟時初始化所有狀態
  useEffect(() => {
    if (isSubItemModalOpen) {
      setSubTitle(editingSubItem?.title || '');
      setSubAddress(editingSubItem?.address || '');
      setSubLat(editingSubItem?.lat ?? null);
      setSubLng(editingSubItem?.lng ?? null);
      setSubIsAddrEdited(false);
      setSubDuration(editingSubItem?.duration || 30);
      setSubStartTime(editingSubItem?.start_time || (isTimeFixed ? formData.start_time : ''));
      setSubEndTime(editingSubItem?.end_time || (isTimeFixed ? formData.end_time : ''));
      setSubNextWalkMins(editingSubItem?.next_walk_mins || 0);
      setSubWalkAuto(!(editingSubItem?.next_walk_mins > 0));
      setSubWalkEstimate(0);
    }
  }, [isSubItemModalOpen, editingSubItem]);

  // 自動估算步行時間（Haversine 直線距離 ×1.3 換算，供 auto 模式顯示）
  useEffect(() => {
    if (!isSubItemModalOpen) return;
    const editingIdx = editingSubItem ? subItems.findIndex((i: any) => i.id === editingSubItem.id) : subItems.length;
    const nextSub = subItems[editingIdx + 1];
    const fromLat = subLat;
    const fromLng = subLng;
    const toLat = nextSub?.lat;
    const toLng = nextSub?.lng;
    if (!fromLat || !fromLng || !toLat || !toLng) { setSubWalkEstimate(0); return; }
    apiFetch(`/api/walking-time?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.minutes) setSubWalkEstimate(d.minutes); })
      .catch(() => {});
  }, [isSubItemModalOpen, subLat, subLng]);

  // 子活動標題同步到地址欄（未手動編輯地址時）
  useEffect(() => {
    if (isSubItemModalOpen && !subIsAddrEdited && !subLat) {
      setSubAddress(subTitle);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTitle]);

  // 自動搜尋地點（帶 DB 快取）
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!isLocationManuallyEdited || formData.address.length < 2) { setSuggestions([]); return; }
      setIsSearching(true);
      try {
        const q = formData.address;
        const cached = await getCachedPlaceSuggestions(q);
        if (cached) { setSuggestions(cached); setIsSearching(false); return; }
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

    try {
      let details: any = await getCachedPlaceDetails(suggestion.place_id);
      if (!details) {
        const res = await apiFetch(`/api/places/details?placeId=${encodeURIComponent(suggestion.place_id)}&session=${sessionToken.current}`);
        if (res.ok) {
          details = await res.json();
          await cachePlaceDetails(suggestion.place_id, details);
        }
        sessionToken.current = Math.random().toString(36).substring(2);
      }
      if (!details) return;
      setFormData(prev => {
        const updated = {
          ...prev,
          address:       details.formattedAddress         || prev.address,
          lat:           details.location?.latitude       ?? prev.lat,
          lng:           details.location?.longitude      ?? prev.lng,
          image_url:     details.actual_photo_url         || prev.image_url,
          rating:        details.rating                   ?? prev.rating,
          reviews_count: details.userRatingCount          ?? prev.reviews_count,
          opening_hours: details.currentOpeningHours
            ? JSON.stringify(details.currentOpeningHours)
            : details.regularOpeningHours
              ? JSON.stringify(details.regularOpeningHours)
              : prev.opening_hours,
          review_summary: details.reviewSummary?.text     ?? prev.review_summary,
          place_status:   details.businessStatus          ?? prev.place_status,
          place_website:  details.websiteUri              ?? prev.place_website,
          place_phone:    details.internationalPhoneNumber ?? prev.place_phone,
        };
        if (!prev.title && details.displayName?.text) updated.title = details.displayName.text;
        return updated;
      });
    } catch { /* silent fallback — address + place_id already set */ }
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

  // 固定時間模式：直接修改 end_time → 反向更新停留時長
  const handleEndTimeChange = (newEnd: string) => {
    setFormData(prev => ({ ...prev, end_time: newEnd }));
    if (isTimeFixed && formData.start_time && newEnd) {
      const newDuration = timeToMinutes(formData.start_time, newEnd);
      if (newDuration > 0) setFixedStayDuration(newDuration);
    }
  };

  const handleSubDurationChange = (mins: number) => {
    setSubDuration(mins);
    if (isTimeFixed && subStartTime) setSubEndTime(addMinutesToTime(subStartTime, mins));
  };

  const handleSubStartChange = (t: string) => {
    setSubStartTime(t);
    if (isTimeFixed && subDuration) setSubEndTime(addMinutesToTime(t, subDuration));
  };

  const executeSubItemSave = async (itemToSave: any) => {
    if (initialData?.id) {
      setSubSaving(true);
      try {
        if (editingSubItem?.id && typeof editingSubItem.id === 'number') {
          await apiFetch(`/api/trips/${tripId}/itineraries/${initialData.id}/sub-items/${editingSubItem.id}`, {
            method: 'PUT', body: JSON.stringify({ ...itemToSave, display_order: editingSubItem.display_order ?? 0 })
          });
          setSubItems((prev: any[]) => prev.map((i: any) => i.id === editingSubItem.id ? { ...i, ...itemToSave } : i));
        } else {
          const res = await apiFetch(`/api/trips/${tripId}/itineraries/${initialData.id}/sub-items`, {
            method: 'POST', body: JSON.stringify({ ...itemToSave, display_order: subItems.length })
          });
          if (res.ok) {
            const { id: newId } = await res.json() as any;
            setSubItems((prev: any[]) => [...prev, { ...itemToSave, id: newId, display_order: prev.length }]);
          }
        }
      } catch { showToast?.('子活動儲存失敗', 'error'); }
      finally { setSubSaving(false); }
    } else {
      if (editingSubItem) {
        setSubItems((prev: any[]) => prev.map((i: any) => i.id === editingSubItem.id ? { ...i, ...itemToSave } : i));
      } else {
        setSubItems((prev: any[]) => [...prev, { ...itemToSave, id: `tmp_${Date.now()}` }]);
      }
    }
    setIsSubItemModalOpen(false);
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
    } catch { showToast?.('圖片上傳失敗', 'error'); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/itineraries/${initialData.id}`, { method: 'DELETE' });
      if (res.ok) { showToast?.('活動已刪除', 'success'); onSuccess(); }
      else showToast?.('刪除活動失敗', 'error');
    } catch { showToast?.('刪除活動失敗', 'error'); }
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
        is_time_fixed: isTimeFixed ? 1 : 0,
        stay_duration: isTimeFixed ? fixedStayDuration.toString() : stayDuration.toString(),
        time_preference: 'anytime'
      };
      const url = initialData
        ? `/api/trips/${tripId}/itineraries/${initialData.id}`
        : backupForId
          ? `/api/trips/${tripId}/itineraries/${backupForId}/backups`
          : `/api/trips/${tripId}/itineraries`;
      const res = await apiFetch(url, { method: initialData ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      if (res.ok) {
        // For new activities, batch-save any pending sub-items
        if (!initialData && subItems.length > 0) {
          const { id: newId } = await res.json() as any;
          await Promise.all(subItems.map((sub, idx) =>
            apiFetch(`/api/trips/${tripId}/itineraries/${newId}/sub-items`, {
              method: 'POST',
              body: JSON.stringify({ ...sub, display_order: idx })
            })
          ));
        }
        showToast?.('活動已儲存', 'success'); onSuccess();
      } else { showToast?.('儲存活動失敗', 'error'); setError('儲存活動失敗'); }
    } catch { showToast?.('儲存活動失敗', 'error'); setError('儲存活動失敗'); }
    finally { setLoading(false); }
  };

  const isKnownPlace = formData.google_place_id && knownPlaceIds.has(formData.google_place_id);

  return (
    <div className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col w-full max-w-md mx-auto shadow-2xl relative max-h-[90vh]">
      {/* 標頭 */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#1c1c1e]/90 backdrop-blur-md z-20 sticky top-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {backupForId ? '新增備案' : initialData ? '編輯活動' : '新增活動'}
          </h2>
          {backupForId && backupForTitle && (
            <p className="text-[11px] text-orange-400/80 mt-0.5 truncate max-w-[240px]">為「{backupForTitle}」的備案</p>
          )}
        </div>
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
                      onChange={e => handleEndTimeChange(e.target.value)}
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
              onFocus={() => { if (!isLocationManuallyEdited) setIsLocationManuallyEdited(true); }}
              className={clsx("w-full bg-[#242426] border rounded-2xl pl-11 pr-4 py-3.5 text-white text-xs focus:border-orange-500 outline-none transition-all",
                isKnownPlace ? "border-orange-500/40" : "border-zinc-800"
              )}
              placeholder="輸入地點名稱搜尋..." />
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
                        className={clsx(
                          "w-full px-4 py-3 flex items-start gap-3 text-left border-b border-zinc-800/50 last:border-0 group transition-colors",
                          isKnown ? "bg-orange-500/5 hover:bg-orange-500/10" : "hover:bg-zinc-800"
                        )}>
                        <MapPin size={14} className={clsx("mt-0.5 shrink-0 transition-colors", isKnown ? "text-orange-500" : "text-zinc-600 group-hover:text-orange-500")} />
                        <div className="flex-1 min-w-0">
                          <div className={clsx("text-xs font-bold truncate flex items-center gap-1.5", isKnown ? "text-orange-400" : "text-white")}>
                            {s.structured_formatting.main_text}
                            {isKnown && (
                              <span className="inline-flex items-center gap-0.5 bg-orange-500/15 text-orange-400 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-orange-500/20 shrink-0">
                                ⚡ 已收錄
                              </span>
                            )}
                          </div>
                          <div className={clsx("text-[10px] truncate", isKnown ? "text-orange-400/50" : "text-zinc-500")}>{s.structured_formatting.secondary_text}</div>
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
                    {item.address && <div className="text-[9px] text-zinc-500 mt-0.5 truncate max-w-[180px]">{item.address}</div>}
                    {(item.start_time || item.end_time) && (
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{item.start_time} — {item.end_time}</div>
                    )}
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
          <div className="pt-4 border-t border-zinc-800 space-y-3">
            {onAddBackup && !(initialData as any).backup_for_id && (
              <button type="button" onClick={onAddBackup}
                className="w-full py-3.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 border border-orange-500/20">
                <Plus size={18} />新增備案
              </button>
            )}
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
              className="bg-[#1c1c1e] border border-zinc-800 rounded-[28px] w-full max-w-[360px] p-6 shadow-3xl max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-bold text-white text-sm tracking-tight">
                  {editingSubItem ? '編輯子活動' : '新增子活動'}
                </h3>
                <button type="button" onClick={() => setIsSubItemModalOpen(false)}><X size={18} className="text-zinc-500" /></button>
              </div>
              {isTimeFixed && formData.start_time && formData.end_time && (
                <div className="mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800 text-[10px] text-zinc-400 flex items-center gap-1.5">
                  <Lock size={10} className="text-orange-500" />
                  <span>主活動時段：{formData.start_time} — {formData.end_time}</span>
                </div>
              )}
              {!isTimeFixed && (
                <div className="mb-4 px-3 py-2 bg-orange-500/8 rounded-xl border border-orange-500/20 text-[10px] text-orange-400 flex items-center gap-1.5">
                  <Sparkles size={10} />
                  <span>智慧排程：填寫停留時間，系統將自動安排順序與時段</span>
                </div>
              )}
              <form onSubmit={async e => {
                e.preventDefault();
                const f = e.target as HTMLFormElement;
                const notesEl = f.elements.namedItem('notes') as HTMLTextAreaElement;

                // Time validation (fixed mode)
                if (isTimeFixed) {
                  if (!subStartTime || !subEndTime || subStartTime >= subEndTime) {
                    alert('請設定有效時間（開始 < 結束）'); return;
                  }
                  if (formData.start_time && subStartTime < formData.start_time) {
                    alert(`子活動開始時間不可早於主活動 ${formData.start_time}`); return;
                  }
                  if (formData.end_time && subEndTime > formData.end_time) {
                    alert(`子活動結束時間不可晚於主活動 ${formData.end_time}`); return;
                  }
                }

                const newItem: any = {
                  title: subTitle,
                  start_time: isTimeFixed ? subStartTime : (editingSubItem?.start_time ?? ''),
                  end_time: isTimeFixed ? subEndTime : (editingSubItem?.end_time ?? ''),
                  notes: notesEl?.value || '',
                  address: subAddress,
                  lat: subLat ?? undefined,
                  lng: subLng ?? undefined,
                  duration: subDuration,
                  next_walk_mins: subWalkAuto ? 0 : subNextWalkMins,
                };

                // Duration validation
                const proposedItems = editingSubItem
                  ? subItems.map((i: any) => i.id === editingSubItem.id ? { ...i, duration: subDuration } : i)
                  : [...subItems, { duration: subDuration }];
                const totalSubDuration = proposedItems.reduce((acc: number, i: any) => acc + (Number(i.duration) || 0), 0);
                const parentDuration = (() => {
                  if (isTimeFixed && formData.start_time && formData.end_time) {
                    const [sh, sm] = formData.start_time.split(':').map(Number);
                    const [eh, em] = formData.end_time.split(':').map(Number);
                    return (eh * 60 + em) - (sh * 60 + sm);
                  }
                  return stayDuration || 0;
                })();
                if (parentDuration > 0 && totalSubDuration > parentDuration) {
                  setDurationWarnInfo({ total: totalSubDuration, parent: parentDuration });
                  setPendingSaveItem(newItem);
                  setShowDurationWarn(true);
                  return;
                }

                await executeSubItemSave(newItem);
              }} className="space-y-4">
                {/* Title */}
                <input type="text" required value={subTitle} onChange={e => setSubTitle(e.target.value)} placeholder="子活動名稱"
                  className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-all" />
                {/* Address */}
                <AddressSearchInput
                  value={subAddress}
                  onChange={v => { setSubAddress(v); setSubLat(null); setSubLng(null); setSubIsAddrEdited(true); }}
                  onPlaceSelect={p => { setSubAddress(p.address); setSubLat(p.lat ?? null); setSubLng(p.lng ?? null); setSubIsAddrEdited(true); }}
                  placeholder="地點（選填）..."
                />
                {/* Duration slider — always visible */}
                <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">預計停留時間</span>
                    <div className="flex items-center gap-1">
                      <input type="number" min="5" max="480" step="5" value={subDuration}
                        onChange={e => handleSubDurationChange(Math.max(5, parseInt(e.target.value) || 5))}
                        className="w-14 text-right bg-transparent text-white font-mono text-sm outline-none" />
                      <span className="text-[10px] text-zinc-500">分</span>
                    </div>
                  </div>
                  <input type="range" min="5" max="480" step="5" value={subDuration}
                    onChange={e => handleSubDurationChange(parseInt(e.target.value))}
                    className="w-full accent-orange-500" />
                  <div className="flex justify-between text-[8px] text-zinc-600">
                    <span>5分</span><span>2時</span><span>4時</span><span>6時</span><span>8時</span>
                  </div>
                </div>
                {/* Fixed mode: start time + auto end time */}
                {isTimeFixed && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2">
                      <span className="block text-[8px] text-zinc-500 font-bold mb-1">開始時間</span>
                      <input type="time" value={subStartTime}
                        onChange={e => handleSubStartChange(e.target.value)}
                        min={formData.start_time || undefined}
                        max={formData.end_time || undefined}
                        className="bg-transparent text-white font-mono text-sm w-full outline-none [color-scheme:dark]" />
                    </div>
                    <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2">
                      <span className="block text-[8px] text-zinc-500 font-bold mb-1">結束時間</span>
                      <div className="font-mono text-sm text-zinc-300 pt-0.5">{subEndTime || '—'}</div>
                      <div className="text-[8px] text-zinc-600 mt-0.5">自動計算</div>
                    </div>
                  </div>
                )}
                {/* Notes */}
                <textarea name="notes" defaultValue={editingSubItem?.notes} placeholder="備注..."
                  className="w-full bg-[#242426] border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none min-h-[60px] focus:border-orange-500 transition-all" />
                {/* 下一站步行時間（拉桿 + 手動輸入 + Auto 開關） */}
                {(() => {
                  const editingIdx = editingSubItem ? subItems.findIndex((i: any) => i.id === editingSubItem.id) : subItems.length;
                  const isLastSub = editingIdx >= subItems.length - (editingSubItem ? 1 : 0);
                  if (isLastSub) return null;
                  const displayVal = subWalkAuto ? (subWalkEstimate || 0) : subNextWalkMins;
                  return (
                    <div className="bg-[#242426] border border-zinc-800 rounded-xl px-3 py-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Footprints size={12} className="text-zinc-400 shrink-0" />
                          <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">下一站步行時間</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !subWalkAuto;
                            setSubWalkAuto(next);
                            if (!next && subNextWalkMins === 0 && subWalkEstimate > 0) {
                              setSubNextWalkMins(subWalkEstimate);
                            }
                          }}
                          className={clsx(
                            'text-[9px] font-bold px-2 py-0.5 rounded-lg transition-colors border',
                            subWalkAuto
                              ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                              : 'bg-zinc-700/50 text-zinc-400 border-zinc-700'
                          )}
                        >
                          Auto
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range" min="0" max="60" step="1"
                          value={displayVal}
                          disabled={subWalkAuto}
                          onChange={e => !subWalkAuto && setSubNextWalkMins(parseInt(e.target.value))}
                          className="flex-1 accent-orange-500 disabled:opacity-40"
                        />
                        <input
                          type="number" min="0" max="999"
                          value={displayVal || ''}
                          disabled={subWalkAuto}
                          onChange={e => !subWalkAuto && setSubNextWalkMins(Math.max(0, parseInt(e.target.value) || 0))}
                          placeholder="0"
                          className="w-10 bg-transparent text-white text-sm font-mono text-right outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[10px] text-zinc-500">分</span>
                      </div>
                      {subWalkAuto && subWalkEstimate > 0 && (
                        <div className="text-[8px] text-zinc-600">自動估算（直線距離 ×1.3 換算）</div>
                      )}
                      {subWalkAuto && subWalkEstimate === 0 && (
                        <div className="text-[8px] text-zinc-700">需要子活動座標才能自動估算</div>
                      )}
                    </div>
                  );
                })()}
                <button type="submit" disabled={subSaving}
                  className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50">
                  {subSaving ? '儲存中...' : '儲存子活動'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 子活動時間超出警告 */}
      <AnimatePresence>
        {showDurationWarn && (
          <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-yellow-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">時間衝突</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    子活動總時間 <span className="text-yellow-400 font-bold">{durationWarnInfo.total} 分</span> 超過主活動的 <span className="text-orange-400 font-bold">{durationWarnInfo.parent} 分</span>，請縮短子活動或拉長主活動。
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button type="button"
                  onClick={async () => {
                    const newDur = durationWarnInfo.total;
                    if (isTimeFixed) {
                      handleFixedDurationChange(newDur);
                    } else {
                      setStayDuration(newDur);
                    }
                    setShowDurationWarn(false);
                    if (pendingSaveItem) await executeSubItemSave(pendingSaveItem);
                    setPendingSaveItem(null);
                  }}
                  className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all">
                  拉長主活動（延伸至 {durationWarnInfo.total} 分鐘）
                </button>
                <button type="button"
                  onClick={() => { setShowDurationWarn(false); setPendingSaveItem(null); }}
                  className="w-full py-3 bg-zinc-800 text-zinc-400 rounded-2xl font-bold text-xs hover:bg-zinc-700 transition-colors">
                  取消（調整子活動）
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
