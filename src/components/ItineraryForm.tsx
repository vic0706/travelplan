import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, Clock, MapPin, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';

interface ItineraryFormProps {
  tripId: number;
  defaultCityId?: number;
  date: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ItineraryForm({ tripId, defaultCityId, date, onSuccess, onCancel }: ItineraryFormProps) {
  const { cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    start_time: '09:00',
    end_time: '10:00',
    address: '',
    notes: '',
    country: cities.find(c => c.id === defaultCityId)?.country || '',
    city_id: defaultCityId ? String(defaultCityId) : '',
    tags: [] as string[]
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.country || !formData.city_id) {
      setError('Please select both country and city.');
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(`/api/trips/${tripId}/itineraries`, {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          date,
          city_id: Number(formData.city_id)
        })
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to add activity');
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
        <h2 className="text-xl font-bold text-white">Add Activity</h2>
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Start Time</label>
            <div className="relative">
              <Clock size={16} className="absolute left-3 top-3.5 text-zinc-500" />
              <input
                type="time"
                required
                value={formData.start_time}
                onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">End Time</label>
            <div className="relative">
              <Clock size={16} className="absolute left-3 top-3.5 text-zinc-500" />
              <input
                type="time"
                required
                value={formData.end_time}
                onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
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
              <Loader2 size={18} className="animate-spin" /> Adding...
            </span>
          ) : 'Add Activity'}
        </button>
      </form>
    </div>
  );
}
