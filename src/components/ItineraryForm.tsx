import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2, Image as ImageIcon, Plus, Trash2, Clock, Check, AlertCircle, ChevronRight, ChevronDown, Layers, Trash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { TimeRangePicker } from './TimeRangePicker';
import { LocationPicker } from './LocationPicker';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { format, parseISO, addMinutes, differenceInMinutes, addDays } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { DynamicIcon } from './DynamicIcon';
import { clsx } from 'clsx';

interface ItineraryFormProps {
  tripId: number;
  defaultCityId?: number;
  date: string;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
  onDeleteBooking?: (bookingId: number) => void; // 💡 新增處理整個預訂刪除的 Prop
  initialData?: any;
}

function TagsInput({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder?: string }) {
  const [inputValue, setInputValue] = useState('');
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (newTag && !tags.includes(newTag)) {
        onChange([...tags, newTag].join(', '));
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1).join(', '));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove).join(', '));
  };

  return (
    <div className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-orange-500 flex flex-wrap gap-2 min-h-[50px]">
      {tags.map(tag => (
        <span key={tag} className="bg-zinc-700 text-zinc-200 px-2 py-1 rounded-lg text-sm flex items-center gap-1">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="hover:text-white"><X size={14} /></button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="bg-transparent border-none outline-none text-white flex-1 min-w-[100px]"
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  );
}

const parseTime = (timeStr: string, baseDate: Date) => {
  if (!timeStr) return baseDate;
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(hours || 0, minutes || 0, 0, 0);
  return d;
};

const getEffectiveTimes = (item: any, baseDate: Date) => {
  let start = parseTime(item.start_time, baseDate);
  let end = parseTime(item.end_time || item.start_time, baseDate);
  if (item.next_transport_mode) {
    let addMins = 0;
    if (item.next_transport_time) {
      addMins = parseInt(item.next_transport_time.replace(/\D/g, '')) || 0;
    } else if (item.next_transport_auto_time) {
      addMins = parseInt(item.next_transport_auto_time.replace(/\D/g, '')) || 0;
    }
    end = addMinutes(end, addMins);
  }
  return { start, end };
};

export function ItineraryForm({ tripId, defaultCityId, date, onSuccess, onCancel, onDelete, onDeleteBooking, initialData }: ItineraryFormProps) {
  const { cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  
  const [categories, setCategories] = useState<any[]>([]);

  // 💡 自製彈窗與刪除選擇狀態
  const [alertMessage, setAlertMessage] = useState('');
  const [confirmMessage, setConfirmMessage] = useState<{title: string, msg: string, onConfirm: () => void} | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await apiFetch('/api/settings/categories');
        if (res.ok) {
          const data = await res.json() as any[];
          const uniqueCategories = Array.from(new Map(data.map(item => [item.icon, item])).values());
          setCategories(uniqueCategories);
        }
      } catch (err) { console.error('Failed to fetch categories:', err); }
    };
    fetchCategories();
  }, []);

  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  const [isSubItemModalOpen, setIsSubItemModalOpen] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<any>(null);
  const [subItems, setSubItems] = useState<{id: string, title: string, start_time: string, end_time: string, tags: string, notes: string, address?: string}[]>(
    initialData?.sub_items ? JSON.parse(initialData.sub_items) : []
  );

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    start_time: initialData?.start_time || '09:00',
    end_time: initialData?.end_time || '10:00',
    address: initialData?.address || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    city_id: initialData?.city_id ? String(initialData.city_id) : (defaultCityId ? String(defaultCityId) : ''),
    tags: initialData?.tags ? (Array.isArray(initialData.tags) ? initialData.tags.join(', ') : initialData.tags) : '',
    icon: initialData?.icon || ''
  });

  const [duration, setDuration] = useState<number>(() => {
    if (!initialData) return 60;
    const start = parseISO(`${date}T${initialData.start_time}`);
    let end = parseISO(`${date}T${initialData.end_time}`);
    if (end < start) end = addDays(end, 1);
    const diff = differenceInMinutes(end, start);
    return diff > 0 ? diff : 0;
  });

  useEffect(() => {
    if (!formData.start_time) return;
    try {
      const start = parseISO(`${date}T${formData.start_time}`);
      if (isNaN(start.getTime())) return;
      const end = addMinutes(start, duration);
      const endTimeStr = format(end, 'HH:mm');
      if (endTimeStr !== formData.end_time) {
        setFormData(prev => ({ ...prev, end_time: endTimeStr }));
      }
    } catch(e) {
      console.error("Time parsing error:", e);
    }
  }, [duration, formData.start_time, date]);

  const bookings = useLiveQuery(() => db.bookings.where('trip_id').equals(tripId).toArray(), [tripId]) || [];
  const dailyItineraries = useLiveQuery(async () => {
    const all = await db.itineraries.where('trip_id').equals(tripId).toArray();
    return all.filter(i => i.date === date);
  }, [tripId, date]) || [];

  const [hasAutoDetectedCity, setHasAutoDetectedCity] = useState(false);
  useEffect(() => {
    if (!hasAutoDetectedCity && bookings.length > 0 && cities.length > 0) {
      if ((initialData?.type === 'ACCOMMODATION' || initialData?.type === 'RENTAL') && initialData.related_id) {
        const hotelBooking = bookings.find(b => b.id === initialData.related_id);
        if (hotelBooking?.city_id) {
           setFormData(prev => ({ ...prev, city_id: String(hotelBooking.city_id) }));
        }
      } else if (!initialData) {
        const hotelToday = bookings.find(b => (b.category === 'HOTEL' || b.category === 'RENTAL') && date >= b.start_date && date <= b.end_date);
        if (hotelToday) {
          if (hotelToday.city_id) {
             setFormData(prev => ({ ...prev, city_id: String(hotelToday.city_id) }));
          } else {
             const details = typeof hotelToday.details === 'string' ? JSON.parse(hotelToday.details || '{}') : (hotelToday.details || {});
             if (details.city) {
               const matchedCity = cities.find(c => 
                 c.name.toLowerCase().includes(details.city.toLowerCase()) || 
                 details.city.toLowerCase().includes(c.name.toLowerCase())
               );
               if (matchedCity) setFormData(prev => ({ ...prev, city_id: String(matchedCity.id) }));
             }
          }
        }
      }
      setHasAutoDetectedCity(true);
    }
  }, [bookings, date, cities, initialData, hasAutoDetectedCity]);

  const checkOverlapWithBooking = (start: string, end: string) => {
    if (initialData?.type && initialData.type !== 'GENERAL') return null;

    try {
      const baseDate = parseISO(date);
      const s = parseTime(start, baseDate);
      let e = parseTime(end, baseDate);
      if (e < s) e = addDays(e, 1);

      for (const item of dailyItineraries) {
        if (item.type === 'GENERAL') continue; 
        if (initialData && item.id === initialData.id) continue;

        const { start: itemS, end: itemE } = getEffectiveTimes(item, baseDate);
        if (s < itemE && e > itemS) {
          return item.title;
        }
      }
    } catch(err) {
      console.error("Overlap check failed:", err);
    }
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCroppingImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCroppingImage(null);
    setUploading(true);
    setError('');
    try {
      const publicUrl = await uploadImageToSupabase(croppedBlob);
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
    } catch (err: any) {
      setAlertMessage('Failed to upload image: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const executeSave = async () => {
    setLoading(true);
    try {
      for (const sub of subItems) {
        if (sub.start_time < formData.start_time || sub.end_time > formData.end_time) {
          setError(`Sub-item "${sub.title}" must be within the parent activity's time range.`);
          setAlertMessage(`子行程 "${sub.title}" 的時間必須在主行程的時間範圍內。`);
          setLoading(false);
          return;
        }
      }

      let finalImageUrl = formData.image_url;
      if (!initialData && !finalImageUrl && formData.title) {
        try {
          const searchRes = await apiFetch(`/api/images/search?query=${encodeURIComponent(formData.title)}&type=activity`);
          if (searchRes.ok) {
            const images = await searchRes.json() as any[];
            if (images && images.length > 0) finalImageUrl = images[0].url;
          }
        } catch (e) { 
          console.error('Failed to auto-fetch image:', e); 
        }
      }

      const isHotelInstance = initialData?.type === 'ACCOMMODATION' || initialData?.type === 'RENTAL';
      const endpoint = initialData ? `/api/trips/${tripId}/itineraries/${initialData.id}` : `/api/trips/${tripId}/itineraries`;
      const method = initialData ? 'PUT' : 'POST';

      const payload = {
        trip_id: tripId,
        city_id: formData.city_id ? Number(formData.city_id) : null,
        date: date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        title: formData.title,
        address: formData.address || '',
        image_url: finalImageUrl || '',
        notes: formData.notes || '',
        tags: typeof formData.tags === 'string' ? formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        sub_items: JSON.stringify([...subItems].sort((a, b) => a.start_time.localeCompare(b.start_time))),
        icon: formData.icon,
        type: isHotelInstance ? initialData.type : (initialData?.type || 'GENERAL'),
        related_id: isHotelInstance ? initialData.related_id : (initialData?.related_id || null)
      };

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save activity. Status: ${res.status}`);
      }

      await onSuccess();
      
    } catch (err: any) {
      console.error("[DEBUG] Error caught in executeSave:", err);
      setError(err.message);
      setAlertMessage(`發生錯誤: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
       setAlertMessage('請輸入活動標題！(Title is required)');
       return;
    }

    const isHotelInstance = initialData?.type === 'ACCOMMODATION' || initialData?.type === 'RENTAL';
    if (!formData.city_id && !isHotelInstance) {
      setError('Please select a city.');
      setAlertMessage('請選擇一個城市！(Please select a city)');
      return;
    }

    const overlappingBooking = checkOverlapWithBooking(formData.start_time, formData.end_time);
    if (overlappingBooking) {
      setConfirmMessage({
         title: '時間衝突警告',
         msg: `此時間段與已建立的預訂行程「${overlappingBooking}」衝突（包含緩衝/交通時間）。\n\nBooking 享有最高優先權。您確定要繼續建立嗎？`,
         onConfirm: () => {
            setConfirmMessage(null);
            executeSave();
         }
      });
      return;
    }

    await executeSave();
  };

  // 💡 點擊刪除按鈕後的智慧邏輯
  const handleDeleteClick = () => {
    if (initialData?.related_id) {
      setShowDeleteModal(true); // 如果是有關聯預訂的活動，顯示特殊彈窗
    } else {
      // 一般活動，顯示普通確認
      setConfirmMessage({
        title: '刪除活動',
        msg: '您確定要刪除此活動嗎？此操作無法復原。',
        onConfirm: () => {
          setConfirmMessage(null);
          if (onDelete && initialData) onDelete(initialData.id);
        }
      });
    }
  };

  const isLockedTitle = (initialData?.type === 'ACCOMMODATION' && initialData?.title.match(/^(Check-in|Check-out|Back to|Leave)/)) ||
                        (initialData?.type === 'RENTAL' && initialData?.title.match(/^(Pick-up|Return)/));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col w-full max-w-md mx-auto relative">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-md shrink-0">
        <h2 className="text-xl font-bold text-white">
          {initialData ? 'Edit Activity' : `Add Activity for ${format(parseISO(date), 'MMM d, yyyy')}`}
        </h2>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6 pb-24 custom-scrollbar relative z-0">
        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm hidden">{error}</div>}

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Cover Image</label>
          <div className="relative h-40 bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700 group">
            {formData.image_url ? (
              <>
                <img src={formData.image_url} alt="Cover" className="w-full h-full object-cover" />
                <button 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormData({ ...formData, image_url: '' }); }}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-full text-white transition-colors z-10"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                <ImageIcon size={32} className="mb-2 opacity-50" />
                <span className="text-xs">Click to upload image</span>
              </div>
            )}
            {!formData.image_url && <input type="file" accept="image/*" onChange={handleFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploading} />}
            {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Activity Title</label>
          <input 
            type="text" required 
            value={formData.title} 
            onChange={e => setFormData({ ...formData, title: e.target.value })} 
            disabled={isLockedTitle}
            className={clsx(
               "w-full rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors",
               isLockedTitle ? "bg-zinc-800/50 border border-zinc-700/50 text-zinc-500 cursor-not-allowed" : "bg-zinc-800 border border-zinc-700"
            )}
            placeholder="e.g., Visit Tokyo Tower" 
          />
          {isLockedTitle && <p className="text-[10px] text-orange-500 mt-1 ml-1">Title is synced with Booking.</p>}
        </div>

        <div className="flex gap-3">
          <div className="w-[64px] shrink-0">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Icon</label>
            <button
              type="button"
              onClick={() => setIsIconPickerOpen(true)}
              disabled={isLockedTitle}
              className={clsx(
                "w-full h-[52px] rounded-xl flex items-center justify-center transition-colors",
                isLockedTitle ? "bg-zinc-800/50 border border-zinc-700/50 opacity-50 cursor-not-allowed" : "bg-zinc-800 border border-zinc-700 hover:border-orange-500"
              )}
            >
              {formData.icon ? (
                <div className="bg-orange-500/20 p-2 rounded-lg text-orange-500">
                  <DynamicIcon name={formData.icon} size={20} />
                </div>
              ) : (
                <Plus size={20} className="text-zinc-500" />
              )}
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Schedule (Date & Time)</label>
            <button
              type="button"
              onClick={() => setIsTimePickerOpen(true)}
              className="w-full h-[52px] bg-zinc-800 border border-zinc-700 rounded-xl px-4 text-white flex items-center justify-between hover:border-orange-500 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                 <Clock className="text-orange-500 shrink-0" size={18} />
                 <span className="font-bold tracking-wide text-sm truncate">
                   {formData.start_time} - {formData.end_time}
                 </span>
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">City</label>
          <div 
             onClick={() => !isLockedTitle && setIsLocationPickerOpen(true)} 
             className={clsx(
               "w-full rounded-xl px-4 py-3 flex items-center justify-between transition-colors",
               isLockedTitle ? "bg-zinc-800/50 border border-zinc-700/50 cursor-not-allowed" : "bg-zinc-800 border border-zinc-700 cursor-pointer hover:border-orange-500"
             )}
          >
            <span className={formData.city_id ? (isLockedTitle ? 'text-zinc-400' : 'text-white') : 'text-zinc-500'}>
               {formData.city_id ? cities.find(c => String(c.id) === String(formData.city_id))?.name : 'Select a city...'}
            </span>
            <Check size={16} className={formData.city_id ? (isLockedTitle ? 'text-zinc-600' : 'text-orange-500') : 'text-transparent'} />
          </div>
          <LocationPicker isOpen={isLocationPickerOpen} onClose={() => setIsLocationPickerOpen(false)} onSelect={(cityId) => setFormData({ ...formData, city_id: String(cityId) })} groupedCities={groupedCities} />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Address</label>
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-3.5 text-zinc-500" />
            <input 
              type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} 
              disabled={isLockedTitle}
              className={clsx(
                 "w-full rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500",
                 isLockedTitle ? "bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 cursor-not-allowed" : "bg-zinc-800 border border-zinc-700 text-white"
              )}
              placeholder="e.g., 4 Chome-2-8 Shibakoen, Minato City" 
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Tags</label>
          <TagsInput value={formData.tags} onChange={val => setFormData({ ...formData, tags: val })} placeholder="Type and press Enter to add tags..." />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sub-itinerary</label>
            <button type="button" onClick={() => { setEditingSubItem(null); setIsSubItemModalOpen(true); }} className="text-xs text-orange-500 hover:text-orange-400 font-medium flex items-center gap-1"><Plus size={14} /> Add Sub-item</button>
          </div>
          <div className="space-y-2">
            {subItems.length > 0 ? (
              subItems.map((item, idx) => (
                <div key={item.id || idx} className="bg-zinc-800 p-3 rounded-xl flex items-start justify-between group cursor-pointer hover:bg-zinc-700/50 transition-colors" onClick={() => { setEditingSubItem(item); setIsSubItemModalOpen(true); }}>
                  <div>
                    <div className="text-sm text-white font-medium">{item.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{item.start_time} - {item.end_time}</div>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setSubItems(subItems.filter(i => i.id !== item.id)); }} className="text-zinc-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                </div>
              ))
            ) : <div className="text-center py-4 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">No sub-items added.</div>}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Notes</label>
          <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]" placeholder="Any additional details..." />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-zinc-900 border-t border-zinc-800 z-20 flex flex-col gap-3">
         <div className="flex gap-3">
             {/* 💡 整合刪除按鈕 */}
             {initialData && (
                <button 
                  type="button" 
                  onClick={handleDeleteClick}
                  className="p-4 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-500 rounded-xl transition-all active:scale-95"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
             )}
             <button type="button" onClick={onCancel} className="flex-1 py-4 rounded-xl font-semibold text-zinc-400 hover:bg-zinc-800 transition-colors">Cancel</button>
             <button 
               type="button" 
               disabled={loading} 
               onClick={handleSubmit} 
               className="flex-[2] py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
             >
               {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> {initialData ? 'Updating...' : 'Adding...'}</span> : (initialData ? 'Update Activity' : 'Add Activity')}
             </button>
         </div>
      </div>

      {/* --- 💡 自製智慧刪除選項彈窗 (Hotel/Rental 專用) --- */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 10 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 10 }} 
              className="bg-zinc-900 border border-orange-500/30 rounded-3xl p-6 w-full max-w-[320px] shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mb-4 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                <Trash2 size={28} />
              </div>
              <h3 className="font-bold text-white text-lg mb-2">Delete Activity</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                此行程項目由預訂（Booking）自動生成。您想如何處理？
              </p>
              
              <div className="w-full space-y-3">
                <button 
                  onClick={() => { setShowDeleteModal(false); if (onDelete && initialData) onDelete(initialData.id); }} 
                  className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Layers size={16} /> 僅刪除此項活動
                </button>
                <button 
                  onClick={() => { setShowDeleteModal(false); if (onDeleteBooking) onDeleteBooking(initialData.related_id); }} 
                  className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                >
                  <Trash size={16} /> 刪除整個預訂紀錄
                </button>
                <button 
                  onClick={() => setShowDeleteModal(false)} 
                  className="w-full py-3 text-zinc-500 hover:text-white font-medium transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTimePickerOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-full overflow-hidden"
            >
              <div className="p-5 border-b border-zinc-800 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-bold text-white">Schedule</h3>
                <button onClick={() => setIsTimePickerOpen(false)} className="text-zinc-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-6 overflow-y-visible custom-scrollbar min-h-[350px] pb-12">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Arrival Time</label>
                      <input 
                        type="time" 
                        value={formData.start_time} 
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} 
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Departure Time</label>
                      <input 
                        type="time" 
                        value={formData.end_time} 
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          setFormData(prev => ({ ...prev, end_time: newEnd }));
                          try {
                            const start = parseISO(`${date}T${formData.start_time}`);
                            let endObj = parseISO(`${date}T${newEnd}`);
                            if (endObj < start) endObj = addDays(endObj, 1);
                            setDuration(differenceInMinutes(endObj, start));
                          } catch(err) {}
                        }} 
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]" 
                      />
                    </div>
                  </div>
                  <div className="space-y-3 pt-6">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><Clock size={12} className="text-orange-500" />Duration</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          value={duration} 
                          onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))} 
                          className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-orange-500 font-bold focus:outline-none focus:border-orange-500" 
                        />
                        <span className="text-zinc-500 text-[10px]">MIN</span>
                      </div>
                    </label>
                    <input 
                      type="range" min="0" max="240" step="5" 
                      value={Math.min(duration, 240)} 
                      onChange={(e) => setDuration(parseInt(e.target.value))} 
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500" 
                    />
                    <div className="flex justify-between text-[10px] text-zinc-600 font-medium">
                      <span>0m</span><span>1h</span><span>2h</span><span>3h</span><span>4h+</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-zinc-800 shrink-0">
                <button onClick={() => setIsTimePickerOpen(false)} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isIconPickerOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-full overflow-hidden"
            >
              <div className="p-5 border-b border-zinc-800 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-bold text-white">Select Icon</h3>
                <button onClick={() => setIsIconPickerOpen(false)} className="text-zinc-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-5 overflow-y-auto custom-scrollbar grid grid-cols-4 gap-3">
                 {categories.map(cat => (
                   <button 
                     key={cat.id} 
                     onClick={() => { setFormData({...formData, icon: cat.icon}); setIsIconPickerOpen(false); }}
                     className={clsx("flex flex-col items-center justify-center p-3 rounded-xl border transition-colors", formData.icon === cat.icon ? "bg-orange-500/20 border-orange-500 text-orange-500" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white")}
                     title={cat.name}
                   >
                     <DynamicIcon name={cat.icon} size={24} />
                   </button>
                 ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSubItemModalOpen && (
          <SubItemModal 
            onClose={() => setIsSubItemModalOpen(false)} parentStartTime={formData.start_time} parentEndTime={formData.end_time} initialData={editingSubItem}
            onSave={(item) => {
              if (editingSubItem) setSubItems(subItems.map(i => i.id === editingSubItem.id ? item : i));
              else setSubItems([...subItems, item]);
              setIsSubItemModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* 🚨 高質感自製 Alert 彈窗 (錯誤提示) */}
      <AnimatePresence>
        {alertMessage && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 10 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 10 }} 
              className="bg-zinc-900 border border-orange-500/30 rounded-3xl p-6 w-full max-w-[320px] shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mb-4 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                <AlertCircle size={28} />
              </div>
              <h3 className="font-bold text-white text-lg mb-2">Notice</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                {alertMessage}
              </p>
              <button 
                type="button"
                onClick={() => setAlertMessage('')} 
                className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-colors shadow-lg shadow-orange-500/20 active:scale-[0.98]"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🚨 高質感自製 Confirm 彈窗 (時間衝突確認) */}
      <AnimatePresence>
        {confirmMessage && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 10 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 10 }} 
              className="bg-zinc-900 border border-orange-500/30 rounded-3xl p-6 w-full max-w-[320px] shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mb-4 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                <AlertCircle size={28} />
              </div>
              <h3 className="font-bold text-white text-lg mb-2">{confirmMessage.title}</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed whitespace-pre-wrap">
                {confirmMessage.msg}
              </p>
              <div className="flex gap-3 w-full">
                <button 
                  type="button"
                  onClick={() => setConfirmMessage(null)} 
                  className="flex-1 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={confirmMessage.onConfirm} 
                  className="flex-1 py-3.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-colors shadow-lg shadow-orange-500/20"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

function SubItemModal({ onClose, onSave, parentStartTime, parentEndTime, initialData }: { onClose: () => void, onSave: (item: any) => void, parentStartTime: string, parentEndTime: string, initialData?: any }) {
  const [data, setData] = useState({
    title: initialData?.title || '', start_time: initialData?.start_time || parentStartTime, end_time: initialData?.end_time || parentEndTime,
    address: initialData?.address || '', tags: initialData?.tags ? (Array.isArray(initialData.tags) ? initialData.tags.join(', ') : initialData.tags) : '', notes: initialData?.notes || ''
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.start_time < parentStartTime || data.end_time > parentEndTime) { setError(`Time must be within ${parentStartTime} - ${parentEndTime}`); return; }
    const tagsArray = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ ...data, tags: tagsArray, id: initialData?.id || crypto.randomUUID() });
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">{initialData ? 'Edit Sub-item' : 'Add Sub-item'}</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2"><AlertCircle size={14} />{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Title</label><input type="text" required value={data.title} onChange={e => setData({ ...data, title: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
          <TimeRangePicker label="Time Range" value={{ start: data.start_time, end: data.end_time }} onChange={(range) => setData({ ...data, start_time: range.start, end_time: range.end })} />
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Address</label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-2.5 text-zinc-500" />
              <input type="text" value={data.address} onChange={e => setData({ ...data, address: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Location..." />
            </div>
          </div>
          <div><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Tags</label><TagsInput value={data.tags} onChange={val => setData({ ...data, tags: val })} placeholder="Type and press Enter to add tags..." /></div>
          <div><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Notes</label><textarea value={data.notes} onChange={e => setData({ ...data, notes: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Details..." /></div>
          <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg px-4 py-2 text-sm transition-colors">{initialData ? 'Save Changes' : 'Add Sub-item'}</button>
        </form>
      </motion.div>
    </div>
  );
}