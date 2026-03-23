import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2, Plus, Trash2, Camera, Image as ImageIcon, Upload, Sparkles, Lock, Unlock, Map as MapIcon, Clock } from 'lucide-react';
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
  const { categories: storeCategories = [], cities: storeCities = [] } = useAppStore();
  
  // 💡 智慧排程核心狀態
  const [isTimeFixed, setIsTimeFixed] = useState(initialData?.is_time_fixed === 1);
  const [stayDuration, setStayDuration] = useState(
    initialData?.stay_duration ? parseInt(initialData.stay_duration) : 60
  );

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    category_id: initialData?.category_id || '',
    city_id: initialData?.city_id || '',
    start_time: initialData?.start_time || '09:00',
    end_time: initialData?.end_time || '10:00',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    google_place_id: initialData?.google_place_id || '',
    lat: initialData?.lat || null,
    lng: initialData?.lng || null,
    time_preference: initialData?.time_preference || 'anytime'
  });

  const [subActivities, setSubActivities] = useState<any[]>(safeParseArray(initialData?.sub_items));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [showCropper, setShowCropper] = useState(false);

  // 整理本地城市清單
  const groupedCities = useMemo(() => {
    return storeCities.reduce((acc: any, city: any) => {
      const country = city.country || 'Others';
      if (!acc[country]) acc[country] = [];
      acc[country].push(city);
      return acc;
    }, {});
  }, [storeCities]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubActivityChange = (id: string, field: string, value: string) => {
    setSubActivities(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addSubActivity = () => {
    const newId = `new-${Date.now()}`;
    setSubActivities([...subActivities, { id: newId, title: '', start_time: formData.start_time, end_time: formData.end_time, notes: '' }]);
  };

  const removeSubActivity = (id: string) => {
    setSubActivities(subActivities.filter(item => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const method = initialData ? 'PUT' : 'POST';
      const url = initialData ? `/api/itineraries/${initialData.id}` : `/api/itineraries`;
      
      const body = {
        ...formData,
        trip_id: tripId,
        date,
        is_time_fixed: isTimeFixed ? 1 : 0,
        stay_duration: stayDuration,
        sub_items: JSON.stringify(subActivities)
      };

      await apiFetch(url, { method, body });
      onSuccess();
    } catch (error) {
      console.error('Failed to save itinerary', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
      
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative w-full max-w-2xl bg-[#0c0c0d] border-t sm:border border-zinc-800 rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col max-h-[95vh] shadow-2xl">
        
        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/50">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">{initialData ? 'EDIT ACTIVITY' : 'NEW ACTIVITY'}</h2>
            <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase mt-1">{date}</p>
          </div>
          <button onClick={onCancel} className="p-3 hover:bg-zinc-900 rounded-full text-zinc-400 transition-all"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-8 space-y-8">
            
            {/* 💡 核心改動：Location & Title */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Activity Details</span>
                {formData.lat && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                    <Sparkles size={10} className="text-green-500" />
                    <span className="text-[10px] font-black text-green-500 uppercase">GPS Ready</span>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 地點選擇器 */}
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="w-full flex items-center gap-4 p-5 bg-zinc-900/50 border border-zinc-800 rounded-[24px] hover:border-orange-500/50 transition-all group text-left"
                >
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-orange-500 group-hover:bg-orange-500/10 transition-all">
                    <MapPin size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[10px] font-black text-zinc-500 uppercase mb-1">Location</span>
                    <span className="text-white font-bold truncate block">
                      {formData.title || 'Select Location...'}
                    </span>
                  </div>
                </button>

                {/* 標題輸入 */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-[24px] p-5 focus-within:border-orange-500/50 transition-all">
                  <span className="block text-[10px] font-black text-zinc-500 uppercase mb-1 tracking-widest">Display Title</span>
                  <input
                    type="text"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Enter activity name..."
                    className="w-full bg-transparent text-white font-bold text-lg outline-none placeholder:text-zinc-700"
                  />
                </div>
              </div>
            </div>

            {/* 💡 智慧排程選項 (時段偏好 & 固定時間) */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-[32px] p-6 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500"><Clock size={16} /></div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">AI Scheduling Logic</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* 固定時間開關 */}
                <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-zinc-800">
                  <div>
                    <div className="text-xs font-bold text-white mb-1">Fixed Time?</div>
                    <div className="text-[10px] text-zinc-500">AI will not change these hours</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTimeFixed(!isTimeFixed)}
                    className={clsx(
                      "w-14 h-8 rounded-full p-1 transition-all duration-300",
                      isTimeFixed ? "bg-orange-500" : "bg-zinc-800"
                    )}
                  >
                    <div className={clsx(
                      "w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center transition-all duration-300",
                      isTimeFixed ? "translate-x-6" : "translate-x-0"
                    )}>
                      {isTimeFixed ? <Lock size={12} className="text-orange-500" /> : <Unlock size={12} className="text-zinc-400" />}
                    </div>
                  </button>
                </div>

                {/* 時段偏好 */}
                <div>
                  <div className="text-[10px] font-black text-zinc-500 uppercase mb-2 ml-1">Time Preference</div>
                  <div className="flex bg-black/40 p-1 rounded-2xl border border-zinc-800">
                    {['anytime', 'morning', 'afternoon', 'evening'].map((pref) => (
                      <button
                        key={pref}
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, time_preference: pref }))}
                        className={clsx(
                          "flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all",
                          formData.time_preference === pref ? "bg-zinc-800 text-orange-500" : "text-zinc-600 hover:text-zinc-400"
                        )}
                      >
                        {pref === 'anytime' ? '不限' : pref === 'morning' ? '早' : pref === 'afternoon' ? '午' : '晚'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 時間輸入與停留時間 */}
              <div className="flex items-center gap-4">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="bg-black/60 border border-zinc-800 rounded-2xl px-4 py-3">
                    <span className="block text-[9px] text-zinc-600 font-black mb-1">START</span>
                    <input type="time" name="start_time" required value={formData.start_time} onChange={handleChange} className="bg-transparent text-white font-mono text-lg w-full outline-none [color-scheme:dark]" />
                  </div>
                  <div className="bg-black/60 border border-zinc-800 rounded-2xl px-4 py-3">
                    <span className="block text-[9px] text-zinc-600 font-black mb-1">END</span>
                    <input type="time" name="end_time" required value={formData.end_time} onChange={handleChange} className="bg-transparent text-white font-mono text-lg w-full outline-none [color-scheme:dark]" />
                  </div>
                </div>
                {!isTimeFixed && (
                  <div className="w-24 bg-black/60 border border-zinc-800 rounded-2xl px-4 py-3">
                    <span className="block text-[9px] text-zinc-600 font-black mb-1">STAY (M)</span>
                    <input type="number" value={stayDuration} onChange={(e) => setStayDuration(parseInt(e.target.value) || 0)} className="bg-transparent text-orange-500 font-mono text-lg w-full outline-none" />
                  </div>
                )}
              </div>
            </div>

            {/* 其他欄位 (Category, Notes) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Category & Style</span>
                <div className="grid grid-cols-3 gap-2">
                  {storeCategories.map((cat: any) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, category_id: cat.id })}
                      className={clsx(
                        "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all",
                        formData.category_id === cat.id ? "bg-orange-500/10 border-orange-500 text-orange-500" : "bg-zinc-900/30 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                      )}
                    >
                      <DynamicIcon name={cat.icon} size={20} />
                      <span className="text-[10px] font-bold truncate w-full text-center">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Notes</span>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Memo, reservation codes, or menu must-haves..."
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl p-5 text-white text-sm outline-none min-h-[140px] focus:border-orange-500 transition-all resize-none"
                />
              </div>
            </div>

            {/* Sub Activities (原本邏輯) */}
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Sub Activities</span>
                <button type="button" onClick={addSubActivity} className="flex items-center gap-1.5 text-orange-500 text-[10px] font-black uppercase"><Plus size={14} /> Add Item</button>
              </div>
              <div className="space-y-3">
                {subActivities.map((sub) => (
                  <div key={sub.id} className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 flex gap-4 group">
                    <div className="flex-1 space-y-3">
                      <input type="text" placeholder="Activity title..." value={sub.title} onChange={(e) => handleSubActivityChange(sub.id, 'title', e.target.value)} className="w-full bg-transparent text-white font-bold text-sm outline-none border-b border-zinc-800 pb-2 focus:border-orange-500 transition-all" />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="time" value={sub.start_time} onChange={(e) => handleSubActivityChange(sub.id, 'start_time', e.target.value)} className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-400 text-xs [color-scheme:dark]" />
                        <input type="time" value={sub.end_time} onChange={(e) => handleSubActivityChange(sub.id, 'end_time', e.target.value)} className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-400 text-xs [color-scheme:dark]" />
                      </div>
                    </div>
                    <button type="button" onClick={() => removeSubActivity(sub.id)} className="p-2 text-zinc-700 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-8 border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-md flex items-center gap-4">
          <button onClick={onCancel} className="flex-1 py-4 px-6 rounded-2xl font-black text-zinc-400 hover:bg-zinc-900 transition-all uppercase tracking-widest text-xs">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-[2] py-4 px-6 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-800 text-white rounded-2xl font-black transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            {initialData ? 'Update Activity' : 'Save Activity'}
          </button>
        </div>

        {/* 💡 Location Picker 整合 */}
        <LocationPicker 
          isOpen={isLocationPickerOpen}
          onClose={() => setIsLocationPickerOpen(false)}
          onSelect={(loc) => {
            // 💡 智慧回填邏輯
            const updateData: any = { 
              ...formData, 
              title: loc.name,
              lat: loc.lat || null,
              lng: loc.lng || null,
            };

            // 如果選的是 Google 地點
            if (loc.google_place_id) {
              updateData.google_place_id = loc.google_place_id;
              // 如果有地址，且目前的備註是空的，才自動填入地址備註
              if (loc.address && (!formData.notes || formData.notes === '')) {
                updateData.notes = `📍 ${loc.address}`;
              }
            } else if (loc.id) {
              // 如果選的是本地城市
              updateData.city_id = loc.id;
              updateData.google_place_id = '';
            }

            setFormData(updateData);
          }}
          groupedCities={groupedCities}
        />

        {/* Image Cropper (原本邏輯) */}
        <AnimatePresence>
          {showCropper && (
            <ImageCropper
              onCropComplete={async (blob) => {
                try {
                  const url = await uploadImageToSupabase(blob, `itinerary_${Date.now()}.jpg`);
                  setFormData({ ...formData, image_url: url });
                  setShowCropper(false);
                } catch (e) { console.error(e); }
              }}
              onCancel={() => setShowCropper(false)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}