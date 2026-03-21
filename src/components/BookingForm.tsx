import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Calendar, Clock, Info, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { LocationPicker } from './LocationPicker';
import { TimePicker } from './TimePicker';
import { DatePicker } from './DatePicker';
import { BookingCategory } from '../types';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

interface BookingFormData {
  category: BookingCategory;
  title: string;
  provider: string;
  order_id: string;
  city_id: string | number;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  start_location: string;
  end_location: string;
  notes: string;
  image_url: string;
  details: any;
  google_place_id?: string;
}

interface BookingFormProps {
  initialData?: any;
  onSubmit: (data: BookingFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function BookingForm({ initialData, onSubmit, onCancel, loading = false }: BookingFormProps) {
  const { cities } = useAppStore();
  const [formData, setFormData] = useState<BookingFormData>({
    category: initialData?.category || 'HOTEL',
    title: initialData?.title || '',
    provider: initialData?.provider || '',
    order_id: initialData?.order_id || '',
    city_id: initialData?.city_id ? String(initialData.city_id) : '',
    start_date: initialData?.start_date || '',
    start_time: initialData?.start_time || '',
    end_date: initialData?.end_date || '',
    end_time: initialData?.end_time || '',
    start_location: initialData?.start_location || '',
    end_location: initialData?.end_location || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    details: initialData?.details || {},
    google_place_id: initialData?.google_place_id || ''
  });

  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        <div className="col-span-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Category</label>
          <div className="grid grid-cols-3 gap-2">
            {(['HOTEL', 'FLIGHT', 'RENTAL', 'RESTAURANT', 'ACTIVITY', 'OTHER'] as BookingCategory[]).map(cat => (
              <button
                key={cat} type="button"
                onClick={() => setFormData({ ...formData, category: cat })}
                className={clsx(
                  "py-2 px-3 rounded-xl text-xs font-bold transition-all border",
                  formData.category === cat ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Title *</label>
          <input
            type="text" required
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder={formData.category === 'HOTEL' ? 'Hotel Name' : 'Booking Title'}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Location & City</label>
          <button
            type="button"
            onClick={() => setIsCityPickerOpen(true)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between text-zinc-400 hover:border-zinc-500 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-orange-500" />
              <span className={formData.city_id ? "text-white" : ""}>
                {formData.city_id ? cities.find(c => String(c.id) === formData.city_id)?.name : 'Select City or Search Place...'}
              </span>
            </div>
            {formData.google_place_id && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">Linked to Google</span>}
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Start Date</label>
          <button type="button" onClick={() => setIsStartDatePickerOpen(true)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-3 text-white">
            <Calendar size={18} className="text-orange-500" />
            {formData.start_date ? format(parseISO(formData.start_date), 'MMM d, yyyy') : 'Select date'}
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Start Time</label>
          <TimePicker value={formData.start_time} onChange={time => setFormData({ ...formData, start_time: time })} />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">End Date</label>
          <button type="button" onClick={() => setIsEndDatePickerOpen(true)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-3 text-white">
            <Calendar size={18} className="text-orange-500" />
            {formData.end_date ? format(parseISO(formData.end_date), 'MMM d, yyyy') : 'Select date'}
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">End Time</label>
          <TimePicker value={formData.end_time} onChange={time => setFormData({ ...formData, end_time: time })} />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Notes</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors h-24 resize-none"
            placeholder="Booking confirmation numbers, details, etc."
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-zinc-800">
        <button type="button" onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl px-4 py-3.5 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3.5 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="animate-spin" size={20} /> : 'Save Booking'}
        </button>
      </div>

      <LocationPicker
        isOpen={isCityPickerOpen}
        onClose={() => setIsCityPickerOpen(false)}
        onSelect={(res) => setFormData({ 
          ...formData, 
          city_id: res.id ? String(res.id) : formData.city_id,
          title: res.google_place_id ? res.name : formData.title,
          start_location: res.address || formData.start_location,
          google_place_id: res.google_place_id || ''
        })}
        groupedCities={groupedCities}
      />

      <DatePicker isOpen={isStartDatePickerOpen} onClose={() => setIsStartDatePickerOpen(false)} onSelect={date => setFormData({ ...formData, start_date: date })} initialDate={formData.start_date} />
      <DatePicker isOpen={isEndDatePickerOpen} onClose={() => setIsEndDatePickerOpen(false)} onSelect={date => setFormData({ ...formData, end_date: date })} initialDate={formData.end_date} />
    </form>
  );
}