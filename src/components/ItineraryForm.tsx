import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2, Image as ImageIcon, Plus, Trash2, Clock, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { TimeRangePicker } from './TimeRangePicker';
import { LocationPicker } from './LocationPicker';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { format, parseISO } from 'date-fns';

interface ItineraryFormProps {
  tripId: number;
  defaultCityId?: number;
  date: string;
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

export function ItineraryForm({ tripId, defaultCityId, date, onSuccess, onCancel, initialData }: ItineraryFormProps) {
  const { cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  // Group cities by country for LocationPicker
  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  // Sub-items state (using the new table structure conceptually, but for now we might still sync with main form or separate)
  // User asked for a popup to add sub-itinerary.
  const [isSubItemModalOpen, setIsSubItemModalOpen] = useState(false);
  const [subItems, setSubItems] = useState<{id: string, title: string, start_time: string, end_time: string, tags: string, notes: string}[]>(
    // If initialData has sub_items (JSON), parse it. If it's from new table, we might need to fetch it separately or pass it in.
    // For now, assume initialData might have it or we fetch it.
    // Given the previous step added endpoints, we should probably fetch sub-items if editing.
    // But to keep it simple for this turn, I'll stick to local state and save on submit if possible, 
    // OR better: handle sub-items separately? 
    // The user asked for "Sub-itinerary: popup window to add".
    // I will implement a local state for sub-items and save them when the main form is submitted, 
    // OR save them immediately if the parent exists.
    // Let's stick to saving with the parent for now to avoid complexity of "draft" parent.
    initialData?.sub_items ? JSON.parse(initialData.sub_items) : []
  );

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    start_time: initialData?.start_time || '09:00',
    end_time: initialData?.end_time || '10:00',
    stay_duration: initialData?.stay_duration || '',
    address: initialData?.address || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    city_id: initialData?.city_id ? String(initialData.city_id) : (defaultCityId ? String(defaultCityId) : ''),
    tags: initialData?.tags || [] as string[]
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCroppingImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCroppingImage(null);
    setUploading(true);
    setError('');
    try {
      const publicUrl = await uploadImageToSupabase(croppedBlob);
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError('Failed to upload image: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTimeRangeChange = (range: { start: string; end: string }) => {
    setFormData(prev => ({
      ...prev,
      start_time: range.start,
      end_time: range.end,
    }));
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

    try {
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
          stay_duration: formData.stay_duration,
          title: formData.title,
          address: formData.address || '',
          image_url: formData.image_url || '',
          notes: formData.notes || '',
          tags: formData.tags || [],
          sub_items: JSON.stringify(subItems)
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
        <button
          onClick={onCancel}
          className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Cover Image</label>
          <div className="relative h-40 bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700 group">
            {formData.image_url ? (
              <>
                <img src={formData.image_url} alt="Cover" className="w-full h-full object-cover" />
                <button 
                  onClick={() => setFormData({ ...formData, image_url: '' })}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-full text-white transition-colors opacity-0 group-hover:opacity-100"
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
            <input 
              type="file" 
              accept="image/*"
              onChange={handleFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={uploading}
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="animate-spin text-orange-500" />
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Activity Title</label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="e.g., Visit Tokyo Tower"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">City</label>
          <div 
            onClick={() => setIsLocationPickerOpen(true)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white cursor-pointer hover:border-orange-500 transition-colors flex items-center justify-between"
          >
            <span className={formData.city_id ? 'text-white' : 'text-zinc-500'}>
              {formData.city_id 
                ? cities.find(c => String(c.id) === String(formData.city_id))?.name 
                : 'Select a city...'}
            </span>
            <Check size={16} className={formData.city_id ? 'text-orange-500' : 'text-transparent'} />
          </div>
          
          <LocationPicker
            isOpen={isLocationPickerOpen}
            onClose={() => setIsLocationPickerOpen(false)}
            onSelect={(cityId) => setFormData({ ...formData, city_id: String(cityId) })}
            groupedCities={groupedCities}
          />
        </div>

        <div className="space-y-4">
          <TimeRangePicker
            label="Time Range"
            value={{ start: formData.start_time, end: formData.end_time }}
            onChange={handleTimeRangeChange}
          />
          
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Stay Duration</label>
            <div className="relative">
              <Clock size={16} className="absolute left-3 top-3.5 text-zinc-500" />
              <input
                type="text"
                value={formData.stay_duration}
                onChange={e => setFormData({ ...formData, stay_duration: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., 2 hours, 30 mins"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Address</label>
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-3.5 text-zinc-500" />
            <input
              type="text"
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g., 4 Chome-2-8 Shibakoen, Minato City"
            />
          </div>
        </div>

        {/* Sub-itinerary Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-zinc-400">Sub-itinerary</label>
            <button
              type="button"
              onClick={() => setIsSubItemModalOpen(true)}
              className="text-xs text-orange-500 hover:text-orange-400 font-medium flex items-center gap-1"
            >
              <Plus size={14} /> Add Sub-item
            </button>
          </div>
          
          <div className="space-y-2">
            {subItems.length > 0 ? (
              subItems.map((item, idx) => (
                <div key={item.id || idx} className="bg-zinc-800 p-3 rounded-xl flex items-start justify-between group">
                  <div>
                    <div className="text-sm text-white font-medium">{item.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {item.start_time} - {item.end_time}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubItems(subItems.filter(i => i.id !== item.id))}
                    className="text-zinc-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-4 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">
                No sub-items added.
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Notes</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
            placeholder="Any additional details..."
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" /> {initialData ? 'Updating...' : 'Adding...'}
            </span>
          ) : (initialData ? 'Update Activity' : 'Add Activity')}
        </button>
      </div>

      {/* Sub-item Modal */}
      <AnimatePresence>
        {isSubItemModalOpen && (
          <SubItemModal 
            onClose={() => setIsSubItemModalOpen(false)}
            onAdd={(item) => {
              setSubItems([...subItems, item]);
              setIsSubItemModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>

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

function SubItemModal({ onClose, onAdd }: { onClose: () => void, onAdd: (item: any) => void }) {
  const [data, setData] = useState({
    title: '',
    start_time: '09:00',
    end_time: '10:00',
    tags: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tagsArray = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    onAdd({ ...data, tags: tagsArray, id: crypto.randomUUID() });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Add Sub-item</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
            <input
              type="text"
              required
              value={data.title}
              onChange={e => setData({ ...data, title: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          
          <TimeRangePicker
            label="Time Range"
            value={{ start: data.start_time, end: data.end_time }}
            onChange={(range) => setData({ ...data, start_time: range.start, end_time: range.end })}
          />

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Tags (comma separated)</label>
            <input
              type="text"
              value={data.tags}
              onChange={e => setData({ ...data, tags: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g. Food, Shopping"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Notes</label>
            <textarea
              value={data.notes}
              onChange={e => setData({ ...data, notes: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Details..."
            />
          </div>
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Add Sub-item
          </button>
        </form>
      </motion.div>
    </div>
  );
}
