import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, MapPin, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { TimeRangePicker } from './TimeRangePicker';
import { format, parseISO } from 'date-fns';

interface ItineraryFormProps {
  tripId: number;
  defaultCityId?: number;
  date: string; // This is the date for the itinerary, not a range
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

export function ItineraryForm({ tripId, defaultCityId, date, onSuccess, onCancel, initialData }: ItineraryFormProps) {
  const { cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [subItems, setSubItems] = useState<{id: string, text: string, completed: boolean}[]>(
    initialData?.sub_items ? JSON.parse(initialData.sub_items) : []
  );
  const [newSubItemText, setNewSubItemText] = useState('');

  const addSubItem = () => {
    if (!newSubItemText.trim()) return;
    setSubItems([...subItems, { id: crypto.randomUUID(), text: newSubItemText, completed: false }]);
    setNewSubItemText('');
  };

  const removeSubItem = (id: string) => {
    setSubItems(subItems.filter(item => item.id !== id));
  };

  const toggleSubItem = (id: string) => {
    setSubItems(subItems.map(item => item.id === id ? { ...item, completed: !item.completed } : item));
  };

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    start_time: initialData?.start_time || '09:00',
    end_time: initialData?.end_time || '10:00',
    address: initialData?.address || '',
    notes: initialData?.notes || '',
    country: initialData?.city_id 
      ? cities.find(c => c.id === initialData.city_id)?.country || '' 
      : cities.find(c => c.id === defaultCityId)?.country || '',
    city_id: initialData?.city_id ? String(initialData.city_id) : (defaultCityId ? String(defaultCityId) : ''),
    tags: initialData?.tags || [] as string[]
  });

  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  const availableCities = formData.country ? groupedCities[formData.country] || [] : [];

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    setFormData(prev => ({
      ...prev,
      country: newCountry,
      city_id: '' // Reset city when country changes
    }));
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

    if (!formData.country || !formData.city_id) {
      setError('Please select both country and city.');
      setLoading(false);
      return;
    }

    if (formData.start_time >= formData.end_time) {
      setError('Start time cannot be later than or equal to end time.');
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
          title: formData.title,
          address: formData.address || '',
          image_url: '', // Default empty string if not provided
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-md">
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

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

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
          <label className="block text-sm font-medium text-zinc-400 mb-1">Country</label>
          <select
            required
            value={formData.country}
            onChange={handleCountryChange}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="" disabled>Select a country</option>
            {Object.keys(groupedCities).sort().map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">City</label>
          <select
            required
            value={formData.city_id}
            onChange={e => setFormData({ ...formData, city_id: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={!formData.country}
          >
            <option value="" disabled>Select a city</option>
            {availableCities.map(city => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </select>
        </div>

        <TimeRangePicker
          label="Time Range"
          value={{ start: formData.start_time, end: formData.end_time }}
          onChange={handleTimeRangeChange}
        />

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

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Sub-itinerary</label>
          <div className="space-y-2">
            {subItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 bg-zinc-800 p-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => toggleSubItem(item.id)}
                  className="w-4 h-4 rounded border-zinc-600 text-orange-500 focus:ring-orange-500 bg-zinc-700"
                />
                <span className={`flex-1 text-sm ${item.completed ? 'text-zinc-500 line-through' : 'text-white'}`}>
                  {item.text}
                </span>
                <button
                  type="button"
                  onClick={() => removeSubItem(item.id)}
                  className="text-zinc-500 hover:text-red-400 p-1"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubItemText}
                onChange={e => setNewSubItemText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubItem();
                  }
                }}
                placeholder="Add sub-item..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={addSubItem}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-xl border border-zinc-700 transition-colors"
              >
                Add
              </button>
            </div>
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
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" /> {initialData ? 'Updating...' : 'Adding...'}
            </span>
          ) : (initialData ? 'Update Activity' : 'Add Activity')}
        </button>
      </form>
    </div>
  );
}
