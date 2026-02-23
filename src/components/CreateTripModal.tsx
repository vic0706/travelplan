import React, { useState } from 'react';
import { useAppStore } from '../store';
import { X, Calendar, MapPin, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiUrl } from '../utils/api';

export function CreateTripModal() {
  const { isCreateTripModalOpen, setCreateTripModalOpen } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    start_date: '',
    end_date: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cover_image_url: '',
    visible_status: 1
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(getApiUrl('/api/trips'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to create trip');
      }

      setCreateTripModalOpen(false);
      // Ideally we should refresh the trips list here, but Home component uses Network-First
      // so a simple reload or re-fetch trigger would work. 
      // For now, let's just reload the page to be safe and simple.
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isCreateTripModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setCreateTripModalOpen(false)}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
            <h2 className="text-xl font-bold text-white">New Trip</h2>
            <button
              onClick={() => setCreateTripModalOpen(false)}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                placeholder="e.g., Summer in Tokyo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Start Date</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-3.5 text-zinc-500" />
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">End Date</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-3.5 text-zinc-500" />
                  <input
                    type="date"
                    required
                    value={formData.end_date}
                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Timezone</label>
              <div className="relative">
                <Globe size={16} className="absolute left-3 top-3.5 text-zinc-500" />
                <select
                  value={formData.timezone}
                  onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none"
                >
                  {Intl.supportedValuesOf('timeZone').map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Cover Image URL (Optional)</label>
              <input
                type="url"
                value={formData.cover_image_url}
                onChange={e => setFormData({ ...formData, cover_image_url: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95 mt-2"
            >
              {loading ? 'Creating...' : 'Create Trip'}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
