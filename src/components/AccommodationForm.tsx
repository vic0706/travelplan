import React, { useState, useEffect } from 'react';
import { X, Bed, Calendar, MapPin, FileText, Loader2, Clock, Trash2, Image as ImageIcon, Search, Upload, Check } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { DateRangePicker } from './DateRangePicker';
import { TimePicker } from './TimePicker';
import { apiFetch } from '../utils/api';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';

import { Accommodation } from '../types';

interface AccommodationFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
  initialData?: Accommodation;
}

export function AccommodationForm({ tripId, onSuccess, onCancel, onDelete, initialData }: AccommodationFormProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    hotel_name: initialData?.hotel_name || '',
    check_in_date: initialData?.check_in_date || '',
    check_out_date: initialData?.check_out_date || '',
    check_in_time: initialData?.check_in_time || '16:00',
    check_out_time: initialData?.check_out_time || '11:00',
    daily_start_time: initialData?.daily_start_time || '08:00',
    daily_end_time: initialData?.daily_end_time || '22:00',
    address: initialData?.address || '',
    order_id: initialData?.order_id || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || ''
  });

  // Initialize search query with hotel name when opening search
  useEffect(() => {
    if (showImageSearch && !searchQuery && formData.hotel_name) {
      setSearchQuery(formData.hotel_name);
      handleSearch(formData.hotel_name);
    }
  }, [showImageSearch]);

  const handleSearch = async (query: string) => {
    if (!query) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/api/images/search?query=${encodeURIComponent(query)}&type=hotel`);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = initialData 
        ? `/api/trips/${tripId}/accommodations/${initialData.id}` 
        : `/api/trips/${tripId}/accommodations`;
      const method = initialData ? 'PUT' : 'POST';

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error(`Failed to ${initialData ? 'update' : 'add'} accommodation`);
      onSuccess();
    } catch (error) {
      console.error(error);
      alert(`Failed to ${initialData ? 'update' : 'add'} accommodation`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col w-full max-w-2xl mx-auto">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10 shrink-0">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Bed className="text-orange-500" size={20} />
          {initialData ? 'Edit Accommodation' : 'Add Accommodation'}
        </h3>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Image Section */}
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Accommodation Photo</label>
          {formData.image_url ? (
            <div className="relative h-48 w-full rounded-xl overflow-hidden group border border-zinc-700">
              <img src={formData.image_url} alt="Hotel" className="w-full h-full object-cover" />
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
                      placeholder="Search for hotel photos..."
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
                  {/* Upload Option */}
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
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Hotel Name</label>
              <div className="relative">
                <Bed className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                <input
                  type="text"
                  required
                  value={formData.hotel_name}
                  onChange={e => setFormData({ ...formData, hotel_name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder="e.g. Grand Hotel"
                />
              </div>
            </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Order ID</label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                value={formData.order_id}
                onChange={e => setFormData({ ...formData, order_id: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="Booking Reference"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Dates</label>
            <DateRangePicker
              label="Stay Duration"
              value={{ 
                start: formData.check_in_date ? new Date(formData.check_in_date) : null, 
                end: formData.check_out_date ? new Date(formData.check_out_date) : null 
              }}
              onChange={range => setFormData({ 
                ...formData, 
                check_in_date: range.start ? format(range.start, 'yyyy-MM-dd') : '',
                check_out_date: range.end ? format(range.end, 'yyyy-MM-dd') : ''
              })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Check-in Time
              </label>
              <input
                type="time"
                value={formData.check_in_time}
                onChange={e => setFormData({ ...formData, check_in_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Check-out Time
              </label>
              <input
                type="time"
                value={formData.check_out_time}
                onChange={e => setFormData({ ...formData, check_out_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Daily Leave Time
              </label>
              <input
                type="time"
                value={formData.daily_start_time}
                onChange={e => setFormData({ ...formData, daily_start_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Daily Return Time
              </label>
              <input
                type="time"
                value={formData.daily_end_time}
                onChange={e => setFormData({ ...formData, daily_end_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Address</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="Full address"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Notes</label>
            <div className="relative">
              <FileText className="absolute left-4 top-4 text-zinc-500" size={18} />
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors min-h-[100px]"
                placeholder="Booking confirmation, special requests, etc."
              />
            </div>
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
      {croppingImage && (
        <ImageCropper
          imageSrc={croppingImage}
          aspect={16 / 9}
          onCropComplete={handleCropComplete}
          onCancel={() => setCroppingImage(null)}
        />
      )}
    </div>
    </div>
  );
}
