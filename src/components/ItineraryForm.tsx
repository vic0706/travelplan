import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2, Image as ImageIcon, Plus, Trash2, Clock, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { TimeRangePicker } from './TimeRangePicker';
import { LocationPicker } from './LocationPicker';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { format, parseISO, isSameDay, addMinutes, subMinutes, differenceInMinutes } from 'date-fns';
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
  initialData?: any;
}

// Helper Component for Tags Input
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

export function ItineraryForm({ tripId, defaultCityId, date, onSuccess, onCancel, onDelete, initialData }: ItineraryFormProps) {
  const { cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await apiFetch('/api/settings/categories');
        if (res.ok) {
          setCategories(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err);
      }
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
    const end = parseISO(`${date}T${initialData.end_time}`);
    const diff = differenceInMinutes(end, start);
    return diff > 0 ? diff : 0;
  });

  useEffect(() => {
    if (!formData.start_time) return;
    const start = parseISO(`${date}T${formData.start_time}`);
    const end = addMinutes(start, duration);
    const endTimeStr = format(end, 'HH:mm');
    if (endTimeStr !== formData.end_time) {
      setFormData(prev => ({ ...prev, end_time: endTimeStr }));
    }
  }, [duration, formData.start_time, date]);

  // Changed to fetch from unified bookings table
  const transportBookings = useLiveQuery(() => db.bookings.where('trip_id').equals(tripId).toArray(), [tripId]) || [];

  const blockedRanges = useMemo(() => {
    const ranges: { start: string, end: string, transportInfo: string }[] = [];
    const targetDate = new Date(`${date}T00:00`);
    const transportTypes = ['FLIGHT', 'TRAIN', 'FERRY', 'PRIVATE_TRANSFER', 'RENTAL'];
    
    transportBookings.forEach(b => {
      if (!transportTypes.includes(b.category)) return;

      const depDateTime = parseISO(`${b.start_date}T${b.start_time}`);
      const arrDateTime = parseISO(`${b.end_date}T${b.end_time}`);
      
      if (isNaN(depDateTime.getTime()) || isNaN(arrDateTime.getTime())) return;

      const details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});
      const blockedStart = subMinutes(depDateTime, details.dep_buffer || 0);
      const blockedEnd = addMinutes(arrDateTime, details.arr_buffer || 0);
      
      const dayStart = new Date(`${date}T00:00`);
      const dayEnd = new Date(`${date}T23:59:59`);
      
      if (blockedStart <= dayEnd && blockedEnd >= dayStart) {
        let rangeStart = "00:00";
        let rangeEnd = "23:59";
        
        if (isSameDay(blockedStart, targetDate)) rangeStart = format(blockedStart, 'HH:mm');
        if (isSameDay(blockedEnd, targetDate)) rangeEnd = format(blockedEnd, 'HH:mm');
        
        ranges.push({ 
          start: rangeStart, 
          end: rangeEnd, 
          transportInfo: `${b.provider || ''} ${b.title}`.trim()
        });
      }
    });
    return ranges;
  }, [transportBookings, date]);

  const checkTransportationOverlap = (start: string, end: string) => {
    if (initialData?.type === 'TRANSPORTATION') return null;
    for (const range of blockedRanges) {
      if (start < range.end && end > range.start) return range.transportInfo;
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
      setError('Failed to upload image: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.city_id) {
      setError('Please select a city.');
      setLoading(false);
      return;
    }

    const overlappingTransport = checkTransportationOverlap(formData.start_time, formData.end_time);
    if (overlappingTransport) {
      if (!confirm(`This time range overlaps with transportation ${overlappingTransport} (including check-in and stay time). Do you want to continue?`)) {
        setLoading(false);
        return;
      }
    }

    for (const sub of subItems) {
      if (sub.start_time < formData.start_time || sub.end_time > formData.end_time) {
        setError(`Sub-item "${sub.title}" must be within the parent activity's time range (${formData.start_time} - ${formData.end_time}).`);
        setLoading(false);
        return;
      }
    }

    try {
      let finalImageUrl = formData.image_url;
      if (!initialData && !finalImageUrl && formData.title) {
        try {
          const searchRes = await apiFetch(`/api/images/search?query=${encodeURIComponent(formData.title)}&type=activity`);
          if (searchRes.ok) {
            const images = await searchRes.json() as any[];
            if (images && images.length > 0) finalImageUrl = images[0].url;
          }
        } catch (e) { console.error('Failed to auto-fetch activity image:', e); }
      }

      const endpoint = initialData 
        ? `/api/trips/${tripId}/itineraries/${initialData.id}` 
        : `/api/trips/${tripId}/itineraries`;
      
      const method = initialData ? 'PUT' : 'POST';

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify({
          trip_id: tripId,
          city_id: Number(formData.city_id),
          date: date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          title: formData.title,
          address: formData.address || '',
          image_url: finalImageUrl || '',
          notes: formData.notes || '',
          tags: typeof formData.tags === 'string' ? formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
          sub_items: JSON.stringify([...subItems].sort((a, b) => a.start_time.localeCompare(b.start_time))),
          icon: formData.icon
        })
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || `Failed to ${initialData ? 'update' : 'add'} activity`);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-md shrink-0">
        <h2 className="text-xl font-bold text-white">
          {initialData ? 'Edit Activity' : `Add Activity for ${format(parseISO(date), 'MMM d, yyyy')}`}
        </h2>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6">
        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Cover Image</label>
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
          <label className="block text-sm font-medium text-zinc-400 mb-1">Activity Title</label>
          <input
            type="text" required value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="e.g., Visit Tokyo Tower"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Category Icon</label>
          <div className="flex flex-wrap gap-3">
            {categories.map((cat) => (
              <button
                key={cat.id} type="button"
                onClick={() => setFormData({ ...formData, icon: formData.icon === cat.icon ? '' : cat.icon })}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${formData.icon === cat.icon ? 'bg-orange-500/20 border-orange-500 text-orange-500' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                title={cat.name}
              >
                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-black/20">
                  <DynamicIcon name={cat.icon} size={18} />
                </div>
                <span className="text-[10px] font-medium max-w-[60px] truncate">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">City</label>
          <div 
            onClick={() => setIsLocationPickerOpen(true)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white cursor-pointer hover:border-orange-500 transition-colors flex items-center justify-between"
          >
            <span className={formData.city_id ? 'text-white' : 'text-zinc-500'}>
              {formData.city_id ? cities.find(c => String(c.id) === String(formData.city_id))?.name : 'Select a city...'}
            </span>
            <Check size={16} className={formData.city_id ? 'text-orange-500' : 'text-transparent'} />
          </div>
          <LocationPicker isOpen={isLocationPickerOpen} onClose={() => setIsLocationPickerOpen(false)} onSelect={(cityId) => setFormData({ ...formData, city_id: String(cityId) })} groupedCities={groupedCities} />
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Arrival Time</label>
              <input type="time" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Departure Time</label>
              <div className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-zinc-400 cursor-not-allowed">{formData.end_time}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2"><Clock size={14} /> Duration</label>
              <span className={clsx("font-mono font-bold text-lg transition-colors", !duration ? "text-zinc-500" : "text-orange-500")}>
                {duration ? `${duration} min` : 'Auto'}
              </span>
            </div>
            <div className="space-y-6">
              <div className="relative pt-1">
                <input type="range" min="0" max="240" step="5" value={Math.min(duration, 240)} onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all" />
                <div className="flex justify-between text-[10px] text-zinc-600 font-mono mt-2 px-1"><span>Auto</span><span>1h</span><span>2h</span><span>3h</span><span>4h+</span></div>
              </div>
              <div className="relative">
                <input type="number" value={duration || ''} onChange={(e) => setDuration(e.target.value === '' ? 0 : parseInt(e.target.value))} placeholder="Auto (0 min)" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">min</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Address</label>
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-3.5 text-zinc-500" />
            <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g., 4 Chome-2-8 Shibakoen, Minato City" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Tags</label>
          <TagsInput value={formData.tags} onChange={val => setFormData({ ...formData, tags: val })} placeholder="Type and press Enter to add tags..." />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-zinc-400">Sub-itinerary</label>
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
          <label className="block text-sm font-medium text-zinc-400 mb-1">Notes</label>
          <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]" placeholder="Any additional details..." />
        </div>

        <div className="flex flex-col gap-3">
          <button type="button" onClick={handleSubmit} disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95">
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> {initialData ? 'Updating...' : 'Adding...'}</span> : (initialData ? 'Update Activity' : 'Add Activity')}
          </button>
          {initialData && onDelete && (
            <button type="button" onClick={() => onDelete(initialData.id)} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold rounded-xl px-4 py-3 transition-all active:scale-95 flex items-center justify-center gap-2"><Trash2 size={18} /> Delete Activity</button>
          )}
        </div>
      </div>

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

      {croppingImage && <ImageCropper imageSrc={croppingImage} aspect={16 / 9} onCropComplete={handleCropComplete} onCancel={() => setCroppingImage(null)} />}
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
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">{initialData ? 'Edit Sub-item' : 'Add Sub-item'}</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2"><AlertCircle size={14} />{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-medium text-zinc-400 mb-1">Title</label><input type="text" required value={data.title} onChange={e => setData({ ...data, title: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
          <TimeRangePicker label="Time Range" value={{ start: data.start_time, end: data.end_time }} onChange={(range) => setData({ ...data, start_time: range.start, end_time: range.end })} />
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Address</label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-2.5 text-zinc-500" />
              <input type="text" value={data.address} onChange={e => setData({ ...data, address: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Location..." />
            </div>
          </div>
          <div><label className="block text-xs font-medium text-zinc-400 mb-1">Tags</label><TagsInput value={data.tags} onChange={val => setData({ ...data, tags: val })} placeholder="Type and press Enter..." /></div>
          <div><label className="block text-xs font-medium text-zinc-400 mb-1">Notes</label><textarea value={data.notes} onChange={e => setData({ ...data, notes: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Details..." /></div>
          <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg px-4 py-2 text-sm transition-colors">{initialData ? 'Save Changes' : 'Add Sub-item'}</button>
        </form>
      </motion.div>
    </div>
  );
}