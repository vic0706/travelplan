import React, { useState, useEffect } from 'react';
import { X, Plane, Train, Ship, Car, Bed, Search, Hash, Loader2, Trash2, Clock, MapPin, FileText, Image as ImageIcon, Upload, Check, ChevronRight } from 'lucide-react';
import { format, parseISO, addMinutes, subMinutes } from 'date-fns';
import { DatePicker } from './DatePicker';
import { DateRangePicker } from './DateRangePicker';
import { apiFetch } from '../utils/api';
import { Booking, BookingCategory } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ConfirmDialog } from './ConfirmDialog';

interface BookingFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
  initialData?: Booking;
}

const BOOKING_CATEGORIES = [
  { id: 'FLIGHT', label: 'Flight', icon: Plane, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'TRAIN', label: 'Train', icon: Train, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'FERRY', label: 'Ferry', icon: Ship, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  { id: 'RENTAL', label: 'Rental', icon: Car, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'PRIVATE_TRANSFER', label: 'Private Transfer', icon: Car, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { id: 'HOTEL', label: 'Hotel', icon: Bed, color: 'text-rose-500', bg: 'bg-rose-500/10' },
] as const;

export function BookingForm({ tripId, onSuccess, onCancel, onDelete, initialData }: BookingFormProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(initialData ? 'form' : 'select');
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [overlapConflict, setOverlapConflict] = useState<string | null>(null);

  const existingBookings = useLiveQuery(() => db.bookings.where('trip_id').equals(tripId).toArray(), [tripId]) || [];

  const [formData, setFormData] = useState({
    category: initialData?.category || 'FLIGHT' as BookingCategory,
    title: initialData?.title || '',
    provider: initialData?.provider || '',
    order_id: initialData?.order_id || '',
    start_date: initialData?.start_date || format(new Date(), 'yyyy-MM-dd'),
    start_time: initialData?.start_time || '10:00',
    end_date: initialData?.end_date || format(new Date(), 'yyyy-MM-dd'),
    end_time: initialData?.end_time || '14:00',
    start_location: initialData?.start_location || '',
    end_location: initialData?.end_location || '',
    city: initialData?.details ? (typeof initialData.details === 'string' ? JSON.parse(initialData.details).city : initialData.details.city) || '' : '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    details: (() => {
      try {
        return typeof initialData?.details === 'string' ? JSON.parse(initialData.details) : initialData?.details;
      } catch (e) {
        return {};
      }
    })() || {} as any,
  });

  const isHotel = formData.category === 'HOTEL';
  const isTransport = ['FLIGHT', 'TRAIN', 'FERRY', 'PRIVATE_TRANSFER', 'RENTAL'].includes(formData.category);

  const checkOverlap = () => {
    const transportTypes = ['FLIGHT', 'TRAIN', 'FERRY', 'PRIVATE_TRANSFER', 'RENTAL'];
    if (!transportTypes.includes(formData.category)) return null;

    const depDateTime = parseISO(`${formData.start_date}T${formData.start_time}`);
    const arrDateTime = parseISO(`${formData.end_date}T${formData.end_time}`);

    if (isNaN(depDateTime.getTime()) || isNaN(arrDateTime.getTime())) return null;

    const newStart = subMinutes(depDateTime, formData.details.dep_buffer || 0);
    const newEnd = addMinutes(arrDateTime, formData.details.arr_buffer || 0);

    for (const b of existingBookings) {
      if ((initialData && b.id === initialData.id) || !transportTypes.includes(b.category)) continue;

      const bDepDateTime = parseISO(`${b.start_date}T${b.start_time}`);
      const bArrDateTime = parseISO(`${b.end_date}T${b.end_time}`);

      if (isNaN(bDepDateTime.getTime()) || isNaN(bArrDateTime.getTime())) continue;

      const bDetails = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});
      const bStart = subMinutes(bDepDateTime, bDetails.dep_buffer || 0);
      const bEnd = addMinutes(bArrDateTime, bDetails.arr_buffer || 0);

      if (newStart < bEnd && newEnd > bStart) {
        return `${b.provider || ''} ${b.title}`;
      }
    }
    return null;
  };

  const handleSearch = async (query: string) => {
    if (!query) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/api/images/search?query=${encodeURIComponent(query)}&type=${isHotel ? 'hotel' : 'transport'}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data as any[]);
      }
    } catch (e) {
      console.error('Search failed', e);
    } finally {
      setSearching(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    try {
      const publicUrl = await uploadImageToSupabase(croppedBlob);
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      setShowImageSearch(false);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSearchFlight = async () => {
    if (!formData.title) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/api/flights/lookup?code=${encodeURIComponent(formData.title)}`);
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        alert(err.error || 'Flight not found');
        return;
      }
      const data = await res.json() as any;
      
      setFormData(prev => ({
        ...prev,
        provider: data.airline || prev.provider,
        start_location: data.departure_airport || prev.start_location,
        start_date: data.departure_date || prev.start_date,
        start_time: data.departure_time || prev.start_time,
        end_location: data.arrival_airport || prev.end_location,
        end_date: data.arrival_date || prev.end_date,
        end_time: data.arrival_time || prev.end_time,
        details: {
          ...prev.details,
          dep_terminal: data.departure_terminal || prev.details.dep_terminal,
          arr_terminal: data.arrival_terminal || prev.details.arr_terminal,
        }
      }));

      alert(`航班資訊已參考 ${format(new Date(), 'yyyy-MM-dd')} 自動填入。`);
    } catch (error) {
      console.error(error);
      alert('Failed to lookup flight');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, bypassCheck = false) => {
    if (e) e.preventDefault();

    if (!bypassCheck) {
      const overlap = checkOverlap();
      if (overlap && !overlapConflict) {
        setOverlapConflict(overlap);
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = initialData 
        ? `/api/trips/${tripId}/bookings/${initialData.id}` 
        : `/api/trips/${tripId}/bookings`;
      const method = initialData ? 'PUT' : 'POST';

      const bookingData = {
        ...formData,
        details: {
          ...formData.details,
          city: formData.city
        }
      };

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(bookingData)
      });
      if (!res.ok) throw new Error(`Failed to ${initialData ? 'update' : 'add'} booking`);
      onSuccess();
    } catch (error) {
      console.error(error);
      alert(`Failed to ${initialData ? 'update' : 'add'} booking`);
    } finally {
      setLoading(false);
    }
  };

  const getLabels = () => {
    switch (formData.category) {
      case 'FLIGHT': return { title: 'Flight No.', provider: 'Airline', start: 'Departure Airport', end: 'Arrival Airport', startTerminal: 'Terminal', endTerminal: 'Terminal' };
      case 'TRAIN': return { title: 'Train No.', provider: 'Operator', start: 'Departure Station', end: 'Arrival Station', startTerminal: 'Platform', endTerminal: 'Platform' };
      case 'FERRY': return { title: 'Vessel', provider: 'Operator', start: 'Departure Port', end: 'Arrival Port', startTerminal: 'Pier', endTerminal: 'Pier' };
      case 'RENTAL': return { title: 'Name', provider: 'Rental Company', start: 'Pick-up Location', end: 'Return Location', startTerminal: 'Pick-up Counter', endTerminal: 'Return Counter' };
      case 'PRIVATE_TRANSFER': return { title: 'Service Name', provider: 'Company', start: 'Pickup Point', end: 'Destination', startTerminal: 'Meeting Point', endTerminal: 'Dropoff Point' };
      case 'HOTEL': return { title: 'Hotel Name', provider: 'Booking Site', start: 'Address', end: '', startTerminal: '', endTerminal: '' };
      default: return { title: 'Title', provider: 'Provider', start: 'Location', end: 'Location', startTerminal: 'Point', endTerminal: 'Point' };
    }
  };

  const labels = getLabels();
  const CategoryIcon = BOOKING_CATEGORIES.find(c => c.id === formData.category)?.icon || Plane;

  if (step === 'select') {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl p-6 w-full max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white">Select Booking Type</h3>
          <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {BOOKING_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => { 
                setFormData({ 
                  ...formData, 
                  category: cat.id as BookingCategory,
                  // Set default times based on category
                  start_time: cat.id === 'HOTEL' ? '16:00' : '10:00',
                  end_time: cat.id === 'HOTEL' ? '11:00' : '14:00',
                  details: cat.id === 'HOTEL' ? { daily_start_time: '08:00', daily_end_time: '22:00' } : { dep_buffer: 120, arr_buffer: 60 }
                }); 
                setStep('form'); 
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-zinc-800 hover:bg-zinc-700 transition-all border border-zinc-700 hover:border-orange-500 group text-center"
            >
              <div className={`p-4 rounded-full ${cat.bg} ${cat.color} group-hover:scale-110 transition-transform`}>
                <cat.icon size={32} />
              </div>
              <span className="text-sm font-bold text-white">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col w-full max-w-2xl mx-auto">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setStep('select')}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <CategoryIcon className="text-orange-500" size={20} />
            {initialData ? 'Edit Booking' : `Add ${BOOKING_CATEGORIES.find(c => c.id === formData.category)?.label}`}
          </h3>
        </div>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Image Section */}
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Photo</label>
          {formData.image_url ? (
            <div className="relative h-48 w-full rounded-xl overflow-hidden group border border-zinc-700">
              <img src={formData.image_url} alt="Booking" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowImageSearch(true)}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg backdrop-blur-sm text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <ImageIcon size={16} /> Change Photo
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, image_url: '' })}
                  className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-lg backdrop-blur-sm transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowImageSearch(true)}
              className="w-full h-32 border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-500 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition-all gap-2"
            >
              <ImageIcon size={24} />
              <span className="text-sm font-medium">Add Photo</span>
            </button>
          )}
        </div>

        {/* Image Search Modal/Panel */}
        <AnimatePresence>
          {showImageSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-zinc-800/50 rounded-xl border border-zinc-700 mb-4"
            >
              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-3 text-zinc-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch(searchQuery)}
                      placeholder="Search for photos..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearch(searchQuery)}
                    disabled={searching}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 rounded-xl font-medium text-sm disabled:opacity-50"
                  >
                    {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                  <label className="aspect-video bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-white gap-1">
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    <Upload size={20} />
                    <span className="text-xs">Upload</span>
                  </label>
                  
                  {searchResults.map((img) => (
                    <div 
                      key={img.id} 
                      onClick={() => {
                        setFormData({ ...formData, image_url: img.url });
                        setShowImageSearch(false);
                      }}
                      className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group"
                    >
                      <img src={img.thumb} alt={img.alt} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Check size={20} className="text-white" />
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  type="button"
                  onClick={() => setShowImageSearch(false)}
                  className="w-full py-2 text-zinc-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 relative">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.title}</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder={`e.g. ${formData.category === 'FLIGHT' ? 'BR123' : 'Grand Hotel'}`}
                />
                {formData.category === 'FLIGHT' && (
                  <button
                    type="button"
                    onClick={handleSearchFlight}
                    disabled={searching || !formData.title}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-white disabled:opacity-50"
                  >
                    {searching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.provider}</label>
              <input
                type="text"
                value={formData.provider}
                onChange={e => setFormData({ ...formData, provider: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. EVA Air"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Order ID</label>
            <div className="relative">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                value={formData.order_id}
                onChange={e => setFormData({ ...formData, order_id: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="Booking Reference"
              />
            </div>
          </div>

          {isHotel && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. Tokyo"
              />
            </div>
          )}

          {isHotel ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Stay Duration</label>
              <DateRangePicker
                value={{ 
                  start: formData.start_date ? new Date(formData.start_date) : null, 
                  end: formData.end_date ? new Date(formData.end_date) : null 
                }}
                onChange={range => setFormData({ 
                  ...formData, 
                  start_date: range.start ? format(range.start, 'yyyy-MM-dd') : '',
                  end_date: range.end ? format(range.end, 'yyyy-MM-dd') : ''
                })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <DatePicker
                  label="Start Date"
                  value={formData.start_date ? new Date(formData.start_date) : null}
                  onChange={date => setFormData({ ...formData, start_date: format(date, 'yyyy-MM-dd') })}
                />
              </div>
              <div className="space-y-2">
                <DatePicker
                  label="End Date"
                  value={formData.end_date ? new Date(formData.end_date) : null}
                  onChange={date => setFormData({ ...formData, end_date: format(date, 'yyyy-MM-dd') })}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> {isHotel ? 'Check-in Time' : 'Start Time'}
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> {isHotel ? 'Check-out Time' : 'End Time'}
              </label>
              <input
                type="time"
                value={formData.end_time}
                onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {isHotel && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock size={12} /> Daily Leave Time
                </label>
                <input
                  type="time"
                  value={formData.details.daily_start_time || '08:00'}
                  onChange={e => setFormData({ ...formData, details: { ...formData.details, daily_start_time: e.target.value } })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock size={12} /> Daily Return Time
                </label>
                <input
                  type="time"
                  value={formData.details.daily_end_time || '22:00'}
                  onChange={e => setFormData({ ...formData, details: { ...formData.details, daily_end_time: e.target.value } })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-4 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.start}</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="text"
                    required
                    value={formData.start_location}
                    onChange={e => setFormData({ ...formData, start_location: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder={isHotel ? 'Hotel Address' : 'Departure Location'}
                  />
                </div>
              </div>
              {isTransport && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.startTerminal}</label>
                  <input
                    type="text"
                    value={formData.details.dep_terminal || ''}
                    onChange={e => setFormData({ ...formData, details: { ...formData.details, dep_terminal: e.target.value } })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="e.g. 2"
                  />
                </div>
              )}
            </div>

            {!isHotel && (
              <div className="space-y-4 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.end}</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input
                      type="text"
                      required
                      value={formData.end_location}
                      onChange={e => setFormData({ ...formData, end_location: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                      placeholder="Arrival Location"
                    />
                  </div>
                </div>
                {isTransport && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.endTerminal}</label>
                    <input
                      type="text"
                      value={formData.details.arr_terminal || ''}
                      onChange={e => setFormData({ ...formData, details: { ...formData.details, arr_terminal: e.target.value } })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                      placeholder="e.g. 1"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {isTransport && (
            <div className="space-y-4 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800">
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-orange-500" />
                    {formData.category === 'FLIGHT' ? 'Check-in Buffer' : formData.category === 'RENTAL' ? 'Pick-up Buffer' : 'Arrival Buffer'}
                  </span>
                  <div className="flex items-center gap-2">
                    {formData.start_date && formData.start_time && !isNaN(parseISO(`${formData.start_date}T${formData.start_time}`).getTime()) && (
                      <span className="text-orange-500/80 text-[10px] font-mono mr-2">
                        {formData.category === 'FLIGHT' ? 'Check-in' : formData.category === 'RENTAL' ? 'Pick-up' : 'Arrive'} @ {format(addMinutes(parseISO(`${formData.start_date}T${formData.start_time}`), formData.details.dep_buffer || 0), 'HH:mm')}
                      </span>
                    )}
                    <input 
                      type="number"
                      value={formData.details.dep_buffer || 0}
                      onChange={(e) => setFormData({
                        ...formData, 
                        details: { ...formData.details, dep_buffer: parseInt(e.target.value) || 0 }
                      })}
                      className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-orange-500 font-bold focus:outline-none focus:border-orange-500"
                    />
                    <span className="text-zinc-500 text-[10px]">MIN</span>
                  </div>
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="240" 
                  step="15"
                  value={formData.details.dep_buffer || 0}
                  onChange={(e) => setFormData({
                    ...formData, 
                    details: { ...formData.details, dep_buffer: parseInt(e.target.value) }
                  })}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 font-medium">
                  <span>0m</span>
                  <span>1h</span>
                  <span>2h</span>
                  <span>3h</span>
                  <span>4h</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-orange-500" />
                    {formData.category === 'RENTAL' ? 'Return Buffer' : 'Exit Buffer'}
                  </span>
                  <div className="flex items-center gap-2">
                    {formData.end_date && formData.end_time && !isNaN(parseISO(`${formData.end_date}T${formData.end_time}`).getTime()) && (
                      <span className="text-orange-500/80 text-[10px] font-mono mr-2">
                        {formData.category === 'RENTAL' ? 'Return' : 'Exit'} @ {format(addMinutes(parseISO(`${formData.end_date}T${formData.end_time}`), formData.details.arr_buffer || 0), 'HH:mm')}
                      </span>
                    )}
                    <input 
                      type="number"
                      value={formData.details.arr_buffer || 0}
                      onChange={(e) => setFormData({
                        ...formData, 
                        details: { ...formData.details, arr_buffer: parseInt(e.target.value) || 0 }
                      })}
                      className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-orange-500 font-bold focus:outline-none focus:border-orange-500"
                    />
                    <span className="text-zinc-500 text-[10px]">MIN</span>
                  </div>
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="240" 
                  step="15"
                  value={formData.details.arr_buffer || 0}
                  onChange={(e) => setFormData({
                    ...formData, 
                    details: { ...formData.details, arr_buffer: parseInt(e.target.value) }
                  })}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 font-medium">
                  <span>0m</span>
                  <span>1h</span>
                  <span>2h</span>
                  <span>3h</span>
                  <span>4h</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Notes</label>
            <div className="relative">
              <FileText className="absolute left-4 top-4 text-zinc-500" size={18} />
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors min-h-[100px]"
                placeholder="Additional notes..."
              />
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-4 rounded-xl font-semibold text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : (initialData ? 'Update' : 'Add')}
              </button>
            </div>

            {initialData && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(initialData.id)}
                className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Delete
              </button>
            )}
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={!!overlapConflict}
        title="時間重疊警告"
        message={`此行程的時間段（包含緩衝時間）與現有的「${overlapConflict}」重疊。您確定要繼續儲存嗎？`}
        confirmText="確定繼續"
        cancelText="返回修改"
        type="warning"
        onConfirm={() => {
          setOverlapConflict(null);
          handleSubmit(undefined, true);
        }}
        onCancel={() => setOverlapConflict(null)}
      />

      {croppingImage && (
        <ImageCropper
          imageSrc={croppingImage}
          aspect={16 / 9}
          onCropComplete={handleCropComplete}
          onCancel={() => setCroppingImage(null)}
        />
      )}
    </div>
  );
}