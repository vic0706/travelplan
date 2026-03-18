import React, { useState, useEffect } from 'react';
import { useAppStore, User } from '../store';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { X, Calendar, Upload, Loader2, User as UserIcon, Check, CloudLightning, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { Trip } from '../types';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { LocationPicker } from './LocationPicker';
import { DateRangePicker } from './DateRangePicker';
import { ConfirmDialog } from './ConfirmDialog';

interface TripSettingsFormProps {
  trip: Trip;
  onSuccess: () => void;
}

const COMMON_CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'CNY', 'HKD', 'KRW'];

export function TripSettingsForm({ trip, onSuccess }: TripSettingsFormProps) {
  const { cities } = useAppStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncingWeather, setSyncingWeather] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  
  const [selectedCountry, setSelectedCountry] = useState('');
  const [currencyInput, setCurrencyInput] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting_transportations' | 'deleting_itineraries' | 'deleting_expenses' | 'deleting_trip' | 'finishing' | 'deleted'>('idle');
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const [formData, setFormData] = useState({
    title: trip.title,
    start_date: trip.start_date,
    end_date: trip.end_date,
    cover_image_url: trip.cover_image_url || '',
    is_public: trip.is_public ? 1 : 0,
    default_city_id: trip.default_city_id ? String(trip.default_city_id) : '',
    currencies: trip.currencies || ['TWD']
  });

  // Group cities by country
  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  const countries = Object.keys(groupedCities).sort();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, membersRes] = await Promise.all([
          apiFetch('/api/users'),
          apiFetch(`/api/trips/${trip.id}/members`)
        ]);
        
        if (usersRes.ok) setUsers(await usersRes.json() as User[]);
        if (membersRes.ok) {
          const data = await membersRes.json() as { id: number }[];
          setSelectedMembers(data.map((m) => m.id));
        }

        // Set initial selected country based on default city
        if (trip.default_city_id) {
          const city = cities.find(c => c.id === trip.default_city_id);
          if (city) setSelectedCountry(city.country);
        }
      } catch (err) {
        console.error('Failed to fetch data', err);
      }
    };
    fetchData();
  }, [trip.id, cities, trip.default_city_id]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setCroppingImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCroppingImage(null);
    setUploading(true);
    setError('');
    try {
      const publicUrl = await uploadImageToSupabase(croppedBlob);
      setFormData(prev => ({ ...prev, cover_image_url: publicUrl }));
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError('Failed to upload image: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleMember = (userId: number) => {
    setSelectedMembers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddCurrency = () => {
    if (!currencyInput) return;
    const code = currencyInput.toUpperCase();
    if (!formData.currencies.includes(code)) {
      setFormData(prev => ({ ...prev, currencies: [...prev.currencies, code] }));
    }
    setCurrencyInput('');
  };

  const removeCurrency = (code: string) => {
    setFormData(prev => ({ ...prev, currencies: prev.currencies.filter(c => c !== code) }));
  };

  const handleSyncWeather = async () => {
    setSyncingWeather(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/weather/sync`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to sync weather');
      alert('Weather synced successfully!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncingWeather(false);
    }
  };

  const handleDeleteTrip = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Step 1: Deleting Transportations & Accommodations
      setDeleteStatus('deleting_transportations');
      await new Promise(resolve => setTimeout(resolve, 300)); // Small delay for UX visibility
      
      // Step 2: Deleting Itineraries
      setDeleteStatus('deleting_itineraries');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 3: Deleting Expenses
      setDeleteStatus('deleting_expenses');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 4: Final Trip Deletion
      setDeleteStatus('deleting_trip');
      const res = await apiFetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete trip');
      
      setDeleteStatus('finishing');
      
      // CRITICAL: Explicitly delete related data from IndexedDB
      // NOTE: We do NOT delete the trip record itself here to prevent the UI from unmounting prematurely
      // The Home page logic will handle the cleanup of the trip record upon sync
      try {
        // Add a timeout to prevent hanging if DB operations are slow
        await Promise.race([
          Promise.all([
            // db.trips.delete(trip.id), // REMOVED: Let Home.tsx handle this to avoid unmount race condition
            db.itineraries.where('trip_id').equals(trip.id).delete(),
            db.expenses.where('trip_id').equals(trip.id).delete(),
            db.transportations.where('trip_id').equals(trip.id).delete(),
            db.accommodations.where('trip_id').equals(trip.id).delete(),
            db.tripMembers.where('trip_id').equals(trip.id).delete()
          ]),
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);
      } catch (dbError) {
        console.warn('Failed to cleanup local DB, proceeding with redirect:', dbError);
      }
      
      // Show "Deleted!" state briefly
      setDeleteStatus('deleted');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Force redirect to home using React Router for smoother transition
      navigate('/', { replace: true });
      
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(err.message);
      setDeleteStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Update Trip
      const res = await apiFetch(`/api/trips/${trip.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...formData,
          default_city_id: formData.default_city_id ? Number(formData.default_city_id) : null
        })
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to update trip');
      }

      // 1.5 Handle Accommodation Extension (User Request)
      // If end_date was extended, create a new accommodation card for the gap
      const oldEnd = trip.end_date;
      const newEnd = formData.end_date;
      if (oldEnd && newEnd && newEnd > oldEnd) {
        try {
          // Find the last accommodation to copy details if possible
          const lastAccs = await db.accommodations.where('trip_id').equals(trip.id).toArray();
          const lastAcc = lastAccs.sort((a, b) => b.check_out_date.localeCompare(a.check_out_date))[0];
          
          await apiFetch(`/api/trips/${trip.id}/accommodations`, {
            method: 'POST',
            body: JSON.stringify({
              hotel_name: lastAcc?.hotel_name || 'New Accommodation',
              check_in_date: oldEnd, // Start from the old end date
              check_out_date: newEnd,
              check_in_time: lastAcc?.check_in_time || '16:00',
              check_out_time: lastAcc?.check_out_time || '11:00',
              address: lastAcc?.address || '',
              notes: 'Automatically created due to trip extension'
            })
          });
        } catch (accErr) {
          console.warn('Failed to auto-create accommodation:', accErr);
        }
      }

      // 2. Update Members
      await apiFetch(`/api/trips/${trip.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedMembers })
      });

      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDeleteButtonText = () => {
    switch (deleteStatus) {
      case 'deleting_transportations': return 'Deleting transportations and accommodations...';
      case 'deleting_itineraries': return 'Deleting itinerary activities...';
      case 'deleting_expenses': return 'Deleting expense records...';
      case 'deleting_trip': return 'Deleting trip details...';
      case 'finishing': return 'Finishing up...';
      case 'deleted': return 'Deleted!';
      default: return 'Delete Everything';
    }
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-bold"
          >
            <Check size={20} />
            <span>Settings saved successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-6 pb-safe-bottom">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Trip Title</label>
        <input
          type="text"
          required
          value={formData.title}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-zinc-400">Primary City</label>
        <div 
          onClick={() => setIsLocationPickerOpen(true)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white cursor-pointer hover:border-orange-500 transition-colors flex items-center justify-between"
        >
          <span className={formData.default_city_id ? 'text-white' : 'text-zinc-500'}>
            {formData.default_city_id 
              ? cities.find(c => String(c.id) === String(formData.default_city_id))?.name 
              : 'Select a city'}
          </span>
          <Check size={16} className={formData.default_city_id ? 'text-orange-500' : 'text-transparent'} />
        </div>
        
        <LocationPicker
          isOpen={isLocationPickerOpen}
          onClose={() => setIsLocationPickerOpen(false)}
          onSelect={(cityId) => setFormData({ ...formData, default_city_id: String(cityId) })}
          groupedCities={groupedCities}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Trip Dates</label>
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

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Visibility</label>
        <div className="flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-xl p-3">
          <div className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${formData.is_public ? 'bg-orange-500' : 'bg-zinc-600'}`} onClick={() => setFormData({ ...formData, is_public: formData.is_public ? 0 : 1 })}>
            <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${formData.is_public ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <span className="text-white font-medium">{formData.is_public ? 'Public' : 'Private'}</span>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          {formData.is_public ? 'Anyone can view this trip.' : 'Only members and admins can view this trip.'}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Currencies</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {formData.currencies.map(currency => (
            <div key={currency} className="bg-orange-500/20 border border-orange-500/50 text-orange-400 rounded-lg px-3 py-1 flex items-center gap-2">
              <span className="font-bold text-sm">{currency}</span>
              <button type="button" onClick={() => removeCurrency(currency)} className="hover:text-white">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={currencyInput}
            onChange={e => setCurrencyInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCurrency())}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="Add currency (e.g. USD)"
            maxLength={3}
          />
          <button
            type="button"
            onClick={handleAddCurrency}
            className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl px-4 border border-zinc-700"
          >
            <Plus size={20} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {COMMON_CURRENCIES.map(c => (
            !formData.currencies.includes(c) && (
              <button
                key={c}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, currencies: [...prev.currencies, c] }))}
                className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 px-2 py-1 rounded-md transition-colors"
              >
                + {c}
              </button>
            )
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Members</label>
        <div className="grid grid-cols-4 gap-2">
          {users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggleMember(u.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                selectedMembers.includes(u.id)
                  ? 'bg-orange-500/20 border-orange-500'
                  : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              <div className="relative w-10 h-10">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <UserIcon size={16} />
                    </div>
                  )}
                </div>
                {selectedMembers.includes(u.id) && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-black">
                    <Check size={10} className="text-white" />
                  </div>
                )}
              </div>
              <span className={`text-[10px] font-medium truncate w-full text-center ${selectedMembers.includes(u.id) ? 'text-white' : 'text-zinc-400'}`}>
                {u.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Cover Image</label>
        <div className="space-y-3">
          {formData.cover_image_url && (
            <div className="relative h-32 w-full rounded-xl overflow-hidden border border-zinc-700">
              <img 
                src={formData.cover_image_url} 
                alt="Cover Preview" 
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setFormData({ ...formData, cover_image_url: '' })}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
              >
                <X size={14} />
              </button>
            </div>
          )}
          
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="cover-upload-settings"
              disabled={uploading}
            />
            <label
              htmlFor="cover-upload-settings"
              className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition-all cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span>Upload Image</span>
                </>
              )}
            </label>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-800 space-y-4">
        <button
          type="button"
          onClick={handleSyncWeather}
          disabled={syncingWeather}
          className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2"
        >
          {syncingWeather ? <Loader2 size={18} className="animate-spin" /> : <CloudLightning size={18} />}
          {syncingWeather ? 'Syncing Trip...' : 'Sync Trip Now'}
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={loading}
            className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 size={18} />
            Delete Trip
          </button>
          
          <button
            type="submit"
            disabled={loading || uploading}
            className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
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

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete Trip"
        message="Are you sure you want to delete this entire trip? This action cannot be undone and all data associated with this trip will be permanently removed."
        confirmText={getDeleteButtonText()}
        cancelText="Keep Trip"
        onConfirm={handleDeleteTrip}
        onCancel={() => !loading && setIsDeleteDialogOpen(false)}
        type="danger"
      />
    </div>
  );
}
