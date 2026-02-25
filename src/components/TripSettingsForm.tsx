import React, { useState, useEffect } from 'react';
import { useAppStore, User } from '../store';
import { X, Calendar, Upload, Loader2, User as UserIcon, Check, CloudLightning, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { Trip } from '../types';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';

interface TripSettingsFormProps {
  trip: Trip;
  onSuccess: () => void;
}

const COMMON_CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'CNY', 'HKD', 'KRW'];

export function TripSettingsForm({ trip, onSuccess }: TripSettingsFormProps) {
  const { cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncingWeather, setSyncingWeather] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  
  const [selectedCountry, setSelectedCountry] = useState('');
  const [currencyInput, setCurrencyInput] = useState('');

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

      // 2. Update Members
      await apiFetch(`/api/trips/${trip.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedMembers })
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Country</label>
            <select
              value={selectedCountry}
              onChange={e => {
                setSelectedCountry(e.target.value);
                setFormData(prev => ({ ...prev, default_city_id: '' }));
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="" disabled>Select Country</option>
              {countries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">City</label>
            <select
              required
              value={formData.default_city_id}
              onChange={e => setFormData({ ...formData, default_city_id: e.target.value })}
              disabled={!selectedCountry}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
            >
              <option value="" disabled>Select City</option>
              {selectedCountry && groupedCities[selectedCountry]?.map(city => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Start Date</label>
          <div className="relative">
            <input
              type="date"
              required
              value={formData.start_date}
              onChange={e => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark] text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">End Date</label>
          <div className="relative">
            <input
              type="date"
              required
              value={formData.end_date}
              onChange={e => setFormData({ ...formData, end_date: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark] text-sm"
            />
          </div>
        </div>
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

      <div className="pt-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={handleSyncWeather}
          disabled={syncingWeather}
          className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2 mb-4"
        >
          {syncingWeather ? <Loader2 size={18} className="animate-spin" /> : <CloudLightning size={18} />}
          {syncingWeather ? 'Syncing Weather...' : 'Sync Weather Now'}
        </button>

        <button
          type="submit"
          disabled={loading || uploading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
      {croppingImage && (
        <ImageCropper
          imageSrc={croppingImage}
          aspect={16 / 9}
          onCropComplete={handleCropComplete}
          onCancel={() => setCroppingImage(null)}
        />
      )}
    </form>
  );
}
