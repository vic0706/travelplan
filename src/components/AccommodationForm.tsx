import React, { useState } from 'react';
import { X, Bed, Calendar, MapPin, FileText, Loader2, Clock, Trash2 } from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';
import { TimePicker } from './TimePicker';
import { apiFetch } from '../utils/api';

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
    notes: initialData?.notes || ''
  });

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto pb-safe-bottom">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Bed className="text-orange-500" size={20} />
          {initialData ? 'Edit Accommodation' : 'Add Accommodation'}
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
                check_in_date: range.start?.toISOString().split('T')[0] || '',
                check_out_date: range.end?.toISOString().split('T')[0] || ''
              })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <TimePicker
                label="Check-in Time"
                value={formData.check_in_time}
                onChange={time => setFormData({ ...formData, check_in_time: time })}
              />
            </div>
            <div className="space-y-2">
              <TimePicker
                label="Check-out Time"
                value={formData.check_out_time}
                onChange={time => setFormData({ ...formData, check_out_time: time })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <TimePicker
                label="Daily Leave Time"
                value={formData.daily_start_time}
                onChange={time => setFormData({ ...formData, daily_start_time: time })}
              />
            </div>
            <div className="space-y-2">
              <TimePicker
                label="Daily Return Time"
                value={formData.daily_end_time}
                onChange={time => setFormData({ ...formData, daily_end_time: time })}
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
              {loading ? <Loader2 className="animate-spin" /> : (initialData ? 'Update Hotel' : 'Add Hotel')}
            </button>
          </div>

          {initialData && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(initialData.id)}
              className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Delete Accommodation
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
