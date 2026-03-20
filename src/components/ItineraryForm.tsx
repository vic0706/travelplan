import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Calendar, Clock, Image as ImageIcon, Tag, Search, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { LocationPicker } from './LocationPicker';
import { TimePicker } from './TimePicker';
import { DatePicker } from './DatePicker';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

export interface ItineraryFormData {
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  address: string;
  image_url: string;
  notes: string;
  tags: string[];
  city_id?: number;
  icon?: string;
  // 💡 新增的智慧同步欄位 (對應 Schema)
  google_place_id?: string;
  lat?: number;
  lng?: number;
}

interface ItineraryFormProps {
  initialData?: Partial<ItineraryFormData>;
  tripStartDate: string;
  tripEndDate: string;
  onSubmit: (data: ItineraryFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const COMMON_TAGS = ['Sightseeing', 'Food', 'Transport', 'Relax', 'Shopping', 'Culture', 'Nature'];

// 💡 預設通用圖庫 (當搜尋無圖或手動輸入時使用)
const PRESET_IMAGES = [
  'https://images.unsplash.com/photo-1527631746610-bca00a040d60?q=80&w=400', // GENERAL TRAVEL
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=400', // FOOD
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=400', // SIGHTSEEING
  'https://images.unsplash.com/photo-1493246295238-93f2f11d8676?q=80&w=400', // NATURE
];

export function ItineraryForm({ initialData, tripStartDate, tripEndDate, onSubmit, onCancel, loading = false }: ItineraryFormProps) {
  const { cities } = useAppStore();
  const [formData, setFormData] = useState<ItineraryFormData>({
    date: initialData?.date || tripStartDate,
    start_time: initialData?.start_time || '10:00',
    end_time: initialData?.end_time || '12:00',
    title: initialData?.title || '',
    address: initialData?.address || '',
    image_url: initialData?.image_url || PRESET_IMAGES[0],
    notes: initialData?.notes || '',
    tags: initialData?.tags || [],
    icon: initialData?.icon || '📍',
    city_id: initialData?.city_id,
    google_place_id: initialData?.google_place_id || '',
    lat: initialData?.lat,
    lng: initialData?.lng,
  });

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [newTag, setNewTag] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.date || !formData.start_time || !formData.end_time) {
      alert('Please fill in required fields.');
      return;
    }
    onSubmit(formData);
  };

  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {/* Date & Time */}
        <div className="col-span-2 grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Date *</label>
            <button type="button" onClick={() => setIsDatePickerOpen(true)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-3 text-white text-sm">
              <Calendar size={18} className="text-orange-500 shrink-0" />
              {formData.date ? format(parseISO(formData.date), 'MMM d, yyyy') : 'Select date'}
            </button>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Start Time *</label>
            <TimePicker value={formData.start_time} onChange={time => setFormData({ ...formData, start_time: time })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">End Time *</label>
            <TimePicker value={formData.end_time} onChange={time => setFormData({ ...formData, end_time: time })} />
          </div>
        </div>

        {/* Title & Icon */}
        <div className="col-span-2 flex gap-3">
          <input
            type="text" value={formData.icon}
            onChange={e => setFormData({ ...formData, icon: e.target.value })}
            className="w-16 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-center text-xl focus:outline-none focus:border-orange-500"
            placeholder="Emoji"
          />
          <input
            type="text" required value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="Activity or Location Title *"
          />
        </div>

        {/* 💡 智慧地點搜尋輸入框 (取代原本的文字地址) */}
        <div className="col-span-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Location / Address</span>
            {formData.google_place_id && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">Linked to Google</span>}
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsLocationPickerOpen(true)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between text-zinc-400 hover:border-zinc-500 transition-colors group text-left"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <MapPin size={18} className={clsx("shrink-0 mt-0.5", formData.google_place_id ? "text-blue-400" : "text-orange-500")} />
                <div className="flex-1 min-w-0">
                  <span className={clsx("font-medium text-sm block truncate", (formData.address || formData.title) ? "text-white" : "text-zinc-500")}>
                    {formData.address || formData.title || 'Search and select place from Google...'}
                  </span>
                  {formData.google_place_id && <span className="text-[11px] text-zinc-500 line-clamp-1">{formData.address}</span>}
                </div>
              </div>
              <Search size={18} className="text-zinc-600 group-hover:text-zinc-400 shrink-0 ml-2" />
            </button>
            {/* 允許手動清除對接 */}
            {formData.google_place_id && (
                <button type="button" onClick={() => setFormData({...formData, google_place_id: '', lat: undefined, lng: undefined})} className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-zinc-600 hover:text-white" title="Unlink from Google">
                    <X size={14}/>
                </button>
            )}
          </div>
        </div>

        {/* Image Selection */}
        <div className="col-span-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><ImageIcon size={14}/>Cover Image</label>
          <div className="grid grid-cols-5 gap-2">
            <input type="text" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className="col-span-3 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm" placeholder="Paste image URL..." />
            {PRESET_IMAGES.map(img => (
              <button key={img} type="button" onClick={() => setFormData({ ...formData, image_url: img })} className={clsx("relative aspect-square rounded-xl overflow-hidden border-2 transition-all", formData.image_url === img ? "border-orange-500 ring-2 ring-orange-500/30" : "border-zinc-700 hover:border-zinc-500")}>
                <img src={img} alt="Preset" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="col-span-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Notes</label>
          <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors h-24 resize-none" placeholder="Opening hours, budget, details..." />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-zinc-800">
        <button type="button" onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl px-4 py-3 transition-colors">Cancel</button>
        <button type="submit" disabled={loading} className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="animate-spin" size={20} /> : (initialData ? 'Update Item' : 'Add to Itinerary')}
        </button>
      </div>

      <DatePicker isOpen={isDatePickerOpen} onClose={() => setIsDatePickerOpen(false)} onSelect={date => setFormData({ ...formData, date: date })} initialDate={formData.date} minDate={tripStartDate} maxDate={tripEndDate} />
      
      <LocationPicker 
        isOpen={isLocationPickerOpen} 
        onClose={() => setIsLocationPickerOpen(false)} 
        // 💡 智慧對接點：自動帶入名稱、地址、座標與 Google ID
        onSelect={(res) => {
            if (res.google_place_id) {
                // 如果是透過搜尋選中的 Google 地點
                setFormData({ 
                  ...formData, 
                  title: res.name,         // 自動填入名稱 (例如：一蘭拉麵)
                  address: res.address || '',// 自動填入地址
                  google_place_id: res.google_place_id, // 智慧同步的核心
                  lat: res.lat,            // 省流座標 (不需後端再解析)
                  lng: res.lng 
                });
            } else if (res.id) {
                // 如果是從原本的城市清單選中
                setFormData({ 
                    ...formData, 
                    city_id: res.id,
                    address: formData.address || res.name // 若無地址，用城市名暫代
                });
            }
        }} 
        groupedCities={groupedCities} 
      />
    </form>
  );
}