import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Calendar, Search, Loader2 } from 'lucide-react';
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
  notes: string;
  tags: string[];
  city_id?: number;
  icon?: string;
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

export function ItineraryForm({ initialData, tripStartDate, tripEndDate, onSubmit, onCancel, loading = false }: ItineraryFormProps) {
  const { cities } = useAppStore();
  const [formData, setFormData] = useState<ItineraryFormData>({
    date: initialData?.date || tripStartDate,
    start_time: initialData?.start_time || '10:00',
    end_time: initialData?.end_time || '12:00',
    title: initialData?.title || '',
    address: initialData?.address || '',
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
    <form onSubmit={handleSubmit} className="space-y-5">
      
      {/* 1. 時間區塊 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Date</label>
          <button type="button" onClick={() => setIsDatePickerOpen(true)} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2.5 flex items-center gap-2 text-white text-sm hover:bg-zinc-800 transition-colors">
            <Calendar size={16} className="text-orange-500 shrink-0" />
            {formData.date ? format(parseISO(formData.date), 'MMM d') : 'Select'}
          </button>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Start</label>
          <TimePicker value={formData.start_time} onChange={time => setFormData({ ...formData, start_time: time })} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">End</label>
          <TimePicker value={formData.end_time} onChange={time => setFormData({ ...formData, end_time: time })} />
        </div>
      </div>

      {/* 2. 圖示與標題 */}
      <div className="flex gap-3">
        <div className="w-14">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Icon</label>
          <input type="text" value={formData.icon} onChange={e => setFormData({ ...formData, icon: e.target.value })} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-2 py-2.5 text-center text-lg focus:outline-none focus:border-orange-500" placeholder="📍" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Activity Title *</label>
          <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-orange-500 text-sm" placeholder="What are you doing?" />
        </div>
      </div>

      {/* 3. Google 地點搜尋 */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Location</span>
          {formData.google_place_id && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">Google Maps Linked</span>}
        </label>
        <div className="relative">
          <button type="button" onClick={() => setIsLocationPickerOpen(true)} className={clsx("w-full border rounded-xl px-3 py-3 flex items-center justify-between transition-colors text-left", formData.google_place_id ? "bg-blue-500/5 border-blue-500/30" : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-500")}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <MapPin size={16} className={formData.google_place_id ? "text-blue-400" : "text-zinc-500"} />
              <div className="flex-1 min-w-0">
                <span className={clsx("font-medium text-sm block truncate", (formData.address || formData.title) ? "text-white" : "text-zinc-500")}>
                  {formData.address || formData.title || 'Search Google Maps...'}
                </span>
              </div>
            </div>
            <Search size={16} className="text-zinc-600 shrink-0 ml-2" />
          </button>
          {formData.google_place_id && (
            <button type="button" onClick={() => setFormData({...formData, google_place_id: '', address: '', lat: undefined, lng: undefined})} className="absolute right-10 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-red-400">
              <X size={14}/>
            </button>
          )}
        </div>
      </div>

      {/* 4. 備註 */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Notes</label>
        <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-orange-500 text-sm h-20 resize-none" placeholder="Add any extra details here..." />
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl py-3 text-sm transition-colors">Cancel</button>
        <button type="submit" disabled={loading} className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2">
          {loading ? <Loader2 className="animate-spin" size={16} /> : (initialData ? 'Save Changes' : 'Add Activity')}
        </button>
      </div>

      <DatePicker isOpen={isDatePickerOpen} onClose={() => setIsDatePickerOpen(false)} onSelect={date => setFormData({ ...formData, date: date })} initialDate={formData.date} minDate={tripStartDate} maxDate={tripEndDate} />
      
      <LocationPicker 
        isOpen={isLocationPickerOpen} 
        onClose={() => setIsLocationPickerOpen(false)} 
        onSelect={(res) => {
          if (res.google_place_id) {
            setFormData({ ...formData, title: res.name, address: res.address || '', google_place_id: res.google_place_id, lat: res.lat, lng: res.lng });
          } else if (res.id) {
            setFormData({ ...formData, city_id: res.id, address: formData.address || res.name });
          }
        }} 
        groupedCities={groupedCities} 
      />
    </form>
  );
}