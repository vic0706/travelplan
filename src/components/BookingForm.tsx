import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Calendar, Loader2, Plane, Train, Ship, Car, Bed, UtensilsCrossed, Ticket, MoreHorizontal, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocationPicker } from './LocationPicker';
import { TimePicker } from './TimePicker';
import { DatePicker } from './DatePicker';
import { BookingCategory } from '../types';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

// ── Category 定義（大圖示 + 顏色 + 描述）───────────────────────────────
const BOOKING_CATEGORIES: {
  id: BookingCategory;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  description: string;
}[] = [
  { id: 'HOTEL',            label: 'Hotel',     icon: Bed,              color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/30', description: 'Accommodation & stays' },
  { id: 'FLIGHT',           label: 'Flight',    icon: Plane,            color: 'text-sky-400',    bg: 'bg-sky-500/15 border-sky-500/30',       description: 'Flights & air travel' },
  { id: 'TRAIN',            label: 'Train',     icon: Train,            color: 'text-green-400',  bg: 'bg-green-500/15 border-green-500/30',   description: 'Train & rail travel' },
  { id: 'FERRY',            label: 'Ferry',     icon: Ship,             color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/30',     description: 'Ferry & boat travel' },
  { id: 'RENTAL',           label: 'Rental',    icon: Car,              color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30', description: 'Car & vehicle rental' },
  { id: 'PRIVATE_TRANSFER', label: 'Transfer',  icon: Car,              color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30', description: 'Private car / taxi' },
];

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

  // ── Step 1: 選 Category（新增時顯示，編輯時直接跳到 Step 2）
  const [step, setStep] = useState<'pick-category' | 'fill-form'>(
    initialData ? 'fill-form' : 'pick-category'
  );

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

  const selectedCatDef = BOOKING_CATEGORIES.find(c => c.id === formData.category);

  // ══════════════════════════════════════════════════
  // STEP 1 — 選擇 Category
  // ══════════════════════════════════════════════════
  if (step === 'pick-category') {
    return (
      <div className="flex flex-col">
        {/* 標頭 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white tracking-tight">New Booking</h2>
          <button type="button" onClick={onCancel} className="p-2 text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Select Category</p>

        {/* 大方塊 Grid */}
        <div className="grid grid-cols-2 gap-3">
          {BOOKING_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <motion.button
                key={cat.id}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setFormData(prev => ({ ...prev, category: cat.id }));
                  setStep('fill-form');
                }}
                className={clsx(
                  'flex flex-col items-start gap-3 p-5 rounded-3xl border-2 transition-all text-left',
                  cat.bg
                )}
              >
                <div className={clsx('p-2.5 rounded-2xl bg-black/20', cat.color)}>
                  <Icon size={28} strokeWidth={1.8} />
                </div>
                <div>
                  <div className={clsx('text-base font-black', cat.color)}>{cat.label}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{cat.description}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // STEP 2 — 填寫表單
  // ══════════════════════════════════════════════════
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* 標頭：可返回 Category 選擇（新增模式），編輯模式不顯示返回 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!initialData && (
            <button
              type="button"
              onClick={() => setStep('pick-category')}
              className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          {/* 顯示選中的 Category */}
          {selectedCatDef && (
            <div className="flex items-center gap-2">
              <div className={clsx('p-1.5 rounded-xl', selectedCatDef.bg, selectedCatDef.color)}>
                <selectedCatDef.icon size={18} strokeWidth={2} />
              </div>
              <span className={clsx('text-base font-black', selectedCatDef.color)}>{selectedCatDef.label}</span>
            </div>
          )}
        </div>
        <button type="button" onClick={onCancel} className="p-2 text-zinc-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* 如果編輯模式：讓用戶切換 Category（橫排小按鈕） */}
      {initialData && (
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Category</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {BOOKING_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <button key={cat.id} type="button"
                  onClick={() => setFormData({ ...formData, category: cat.id })}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap shrink-0',
                    formData.category === cat.id
                      ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  )}>
                  <Icon size={13} />{cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Title *</label>
        <input
          type="text" required
          value={formData.title}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
          placeholder={formData.category === 'HOTEL' ? 'Hotel Name' : formData.category === 'FLIGHT' ? 'e.g. CI100' : 'Booking Title'}
        />
      </div>

      {/* Provider */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Provider</label>
          <input
            type="text"
            value={formData.provider}
            onChange={e => setFormData({ ...formData, provider: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder={formData.category === 'HOTEL' ? 'Hilton' : formData.category === 'FLIGHT' ? 'China Airlines' : 'Provider'}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Order / Conf #</label>
          <input
            type="text"
            value={formData.order_id}
            onChange={e => setFormData({ ...formData, order_id: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="e.g. ABC123"
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Location & City</label>
        <button
          type="button"
          onClick={() => setIsCityPickerOpen(true)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between text-zinc-400 hover:border-zinc-500 transition-colors"
        >
          <div className="flex items-center gap-3">
            <MapPin size={18} className="text-orange-500" />
            <span className={formData.city_id ? 'text-white' : ''}>
              {formData.city_id ? cities.find(c => String(c.id) === formData.city_id)?.name : 'Select City or Search Place...'}
            </span>
          </div>
          {formData.google_place_id && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">Google</span>
          )}
        </button>
      </div>

      {/* Start & End location text (flight/train) */}
      {['FLIGHT', 'TRAIN', 'FERRY', 'RENTAL', 'PRIVATE_TRANSFER'].includes(formData.category) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {formData.category === 'HOTEL' ? 'Address' : 'From'}
            </label>
            <input type="text" value={formData.start_location}
              onChange={e => setFormData({ ...formData, start_location: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
              placeholder={formData.category === 'FLIGHT' ? 'TPE' : 'Departure'} />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">To</label>
            <input type="text" value={formData.end_location}
              onChange={e => setFormData({ ...formData, end_location: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
              placeholder={formData.category === 'FLIGHT' ? 'NRT' : 'Arrival'} />
          </div>
        </div>
      )}
      {formData.category === 'HOTEL' && (
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Address</label>
          <input type="text" value={formData.start_location}
            onChange={e => setFormData({ ...formData, start_location: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="Hotel address" />
        </div>
      )}

      {/* Dates & Times */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
            {formData.category === 'HOTEL' ? 'Check-in' : 'Start Date'}
          </label>
          <button type="button" onClick={() => setIsStartDatePickerOpen(true)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-white hover:border-zinc-500 transition-colors">
            <Calendar size={15} className="text-orange-500 shrink-0" />
            <span className={formData.start_date ? 'text-white' : 'text-zinc-500'}>
              {formData.start_date ? format(parseISO(formData.start_date), 'MMM d, yyyy') : 'Select date'}
            </span>
          </button>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
            {formData.category === 'HOTEL' ? 'Check-out' : 'End Date'}
          </label>
          <button type="button" onClick={() => setIsEndDatePickerOpen(true)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-white hover:border-zinc-500 transition-colors">
            <Calendar size={15} className="text-orange-500 shrink-0" />
            <span className={formData.end_date ? 'text-white' : 'text-zinc-500'}>
              {formData.end_date ? format(parseISO(formData.end_date), 'MMM d, yyyy') : 'Select date'}
            </span>
          </button>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Start Time</label>
          <TimePicker value={formData.start_time} onChange={time => setFormData({ ...formData, start_time: time })} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">End Time</label>
          <TimePicker value={formData.end_time} onChange={time => setFormData({ ...formData, end_time: time })} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Notes</label>
        <textarea
          value={formData.notes}
          onChange={e => setFormData({ ...formData, notes: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors h-20 resize-none text-sm"
          placeholder="Booking confirmation numbers, details..."
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-2 border-t border-zinc-800">
        <button type="button" onClick={onCancel}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl px-4 py-3.5 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={loading}
          className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3.5 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
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

      <DatePicker isOpen={isStartDatePickerOpen} onClose={() => setIsStartDatePickerOpen(false)}
        onSelect={date => setFormData({ ...formData, start_date: date })} initialDate={formData.start_date} />
      <DatePicker isOpen={isEndDatePickerOpen} onClose={() => setIsEndDatePickerOpen(false)}
        onSelect={date => setFormData({ ...formData, end_date: date })} initialDate={formData.end_date} />
    </form>
  );
}