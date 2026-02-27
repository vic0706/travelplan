import React, { useState } from 'react';
import { X, Bed, Calendar, MapPin, FileText, Loader2 } from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';
import { apiFetch } from '../utils/api';

interface AccommodationFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AccommodationForm({ tripId, onSuccess, onCancel }: AccommodationFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    hotel_name: '',
    check_in_date: '',
    check_out_date: '',
    address: '',
    order_id: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/accommodations`, {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Failed to add accommodation');
      onSuccess();
    } catch (error) {
      console.error(error);
      alert('Failed to add accommodation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto pb-safe-bottom">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Bed className="text-orange-500" size={20} />
          Add Accommodation
        </h3>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Check-in</label>
              <DateRangePicker
                label="Check-in"
                value={{ start: formData.check_in_date ? new Date(formData.check_in_date) : null, end: formData.check_in_date ? new Date(formData.check_in_date) : null }}
                onChange={range => setFormData({ ...formData, check_in_date: range.start?.toISOString().split('T')[0] || '' })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Check-out</label>
              <DateRangePicker
                label="Check-out"
                value={{ start: formData.check_out_date ? new Date(formData.check_out_date) : null, end: formData.check_out_date ? new Date(formData.check_out_date) : null }}
                onChange={range => setFormData({ ...formData, check_out_date: range.start?.toISOString().split('T')[0] || '' })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Address</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                required
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

        <div className="pt-4 flex gap-3">
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
            {loading ? <Loader2 className="animate-spin" /> : 'Add Hotel'}
          </button>
        </div>
      </form>
    </div>
  );
}
