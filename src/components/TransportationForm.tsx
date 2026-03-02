import React, { useState } from 'react';
import { X, Plane, Calendar, Clock, MapPin, FileText, Loader2, Trash2, Train, Ship, Bus, Car } from 'lucide-react';
import { format } from 'date-fns';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';
import { apiFetch } from '../utils/api';
import { Transportation } from '../types';

interface TransportationFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
  initialData?: Transportation;
}

const TRANSPORT_TYPES = [
  { id: 'FLIGHT', label: 'Flight', icon: Plane },
  { id: 'TRAIN', label: 'Train', icon: Train },
  { id: 'BOAT', label: 'Boat', icon: Ship },
  { id: 'BUS', label: 'Bus', icon: Bus },
  { id: 'OTHER', label: 'Other', icon: Car },
] as const;

export function TransportationForm({ tripId, onSuccess, onCancel, onDelete, initialData }: TransportationFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: initialData?.type || 'FLIGHT',
    provider: initialData?.provider || '',
    transport_code: initialData?.transport_code || '',
    departure_date: initialData?.departure_date || '',
    departure_time: initialData?.departure_time || '',
    departure_station: initialData?.departure_station || '',
    departure_terminal: initialData?.departure_terminal || '',
    checkin_duration: initialData?.checkin_duration || 120,
    arrival_date: initialData?.arrival_date || '',
    arrival_time: initialData?.arrival_time || '',
    arrival_station: initialData?.arrival_station || '',
    arrival_terminal: initialData?.arrival_terminal || '',
    exit_duration: initialData?.exit_duration || 60,
    stay_duration: initialData?.stay_duration || 0,
    notes: initialData?.notes || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = initialData 
        ? `/api/trips/${tripId}/transportations/${initialData.id}` 
        : `/api/trips/${tripId}/transportations`;
      const method = initialData ? 'PUT' : 'POST';

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error(`Failed to ${initialData ? 'update' : 'add'} transportation`);
      onSuccess();
    } catch (error) {
      console.error(error);
      alert(`Failed to ${initialData ? 'update' : 'add'} transportation`);
    } finally {
      setLoading(false);
    }
  };

  const getLabels = () => {
    switch (formData.type) {
      case 'FLIGHT': return { provider: 'Airline', code: 'Flight No.', station: 'Airport', terminal: 'Terminal' };
      case 'TRAIN': return { provider: 'Operator', code: 'Train No.', station: 'Station', terminal: 'Platform' };
      case 'BOAT': return { provider: 'Operator', code: 'Vessel/Ferry', station: 'Port', terminal: 'Pier' };
      case 'BUS': return { provider: 'Operator', code: 'Bus No.', station: 'Station', terminal: 'Platform' };
      default: return { provider: 'Provider', code: 'Reference', station: 'Location', terminal: 'Point' };
    }
  };

  const labels = getLabels();
  const CurrentIcon = TRANSPORT_TYPES.find(t => t.id === formData.type)?.icon || Plane;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto pb-safe-bottom">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <CurrentIcon className="text-orange-500" size={20} />
          {initialData ? 'Edit Transportation' : 'Add Transportation'}
        </h3>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Type Selection */}
        <div className="grid grid-cols-5 gap-2">
          {TRANSPORT_TYPES.map(type => (
            <button
              key={type.id}
              type="button"
              onClick={() => setFormData({ ...formData, type: type.id })}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                formData.type === type.id
                  ? 'bg-orange-500/20 border-orange-500 text-orange-500'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-800'
              }`}
            >
              <type.icon size={20} />
              <span className="text-[10px] font-bold uppercase">{type.label}</span>
            </button>
          ))}
        </div>

        {/* Provider & Code */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.provider}</label>
            <input
              type="text"
              required
              value={formData.provider}
              onChange={e => setFormData({ ...formData, provider: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder={`e.g. ${formData.type === 'FLIGHT' ? 'EVA Air' : 'Amtrak'}`}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.code}</label>
            <input
              type="text"
              required
              value={formData.transport_code}
              onChange={e => setFormData({ ...formData, transport_code: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder={`e.g. ${formData.type === 'FLIGHT' ? 'BR123' : '101'}`}
            />
          </div>
        </div>

        {/* Departure */}
        <div className="space-y-4 border border-zinc-800/50 rounded-2xl p-4 bg-zinc-950/30">
          <h4 className="text-sm font-semibold text-orange-500 uppercase tracking-wider">Departure</h4>
          
          <div className="space-y-2">
             <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between">
               <span>Check-in Buffer</span>
               <span className="text-orange-500">{formData.checkin_duration} min</span>
             </label>
             <input 
               type="range" 
               min="0" 
               max="240" 
               step="15"
               value={formData.checkin_duration}
               onChange={(e) => setFormData({...formData, checkin_duration: parseInt(e.target.value)})}
               className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
             />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <DatePicker
                label="Date"
                value={formData.departure_date ? new Date(formData.departure_date) : null}
                onChange={date => setFormData({ ...formData, departure_date: format(date, 'yyyy-MM-dd') })}
              />
            </div>
            <div className="space-y-2">
              <TimePicker
                label="Time"
                value={formData.departure_time}
                onChange={time => setFormData({ ...formData, departure_time: time })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.station}</label>
              <input
                type="text"
                required
                value={formData.departure_station}
                onChange={e => setFormData({ ...formData, departure_station: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. TPE"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.terminal}</label>
              <input
                type="text"
                value={formData.departure_terminal}
                onChange={e => setFormData({ ...formData, departure_terminal: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. 2"
              />
            </div>
          </div>
        </div>

        {/* Arrival */}
        <div className="space-y-4 border border-zinc-800/50 rounded-2xl p-4 bg-zinc-950/30">
          <h4 className="text-sm font-semibold text-orange-500 uppercase tracking-wider">Arrival</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
               <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between">
                 <span>Exit Buffer</span>
                 <span className="text-orange-500">{formData.exit_duration} min</span>
               </label>
               <input 
                 type="range" 
                 min="0" 
                 max="240" 
                 step="15"
                 value={formData.exit_duration}
                 onChange={(e) => setFormData({...formData, exit_duration: parseInt(e.target.value)})}
                 className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
               />
            </div>
            <div className="space-y-2">
               <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between">
                 <span>Stay Time</span>
                 <span className="text-orange-500">{formData.stay_duration} min</span>
               </label>
               <input 
                 type="range" 
                 min="0" 
                 max="240" 
                 step="15"
                 value={formData.stay_duration}
                 onChange={(e) => setFormData({...formData, stay_duration: parseInt(e.target.value)})}
                 className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
               />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <DatePicker
                label="Date"
                value={formData.arrival_date ? new Date(formData.arrival_date) : null}
                onChange={date => setFormData({ ...formData, arrival_date: format(date, 'yyyy-MM-dd') })}
              />
            </div>
            <div className="space-y-2">
              <TimePicker
                label="Time"
                value={formData.arrival_time}
                onChange={time => setFormData({ ...formData, arrival_time: time })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.station}</label>
              <input
                type="text"
                required
                value={formData.arrival_station}
                onChange={e => setFormData({ ...formData, arrival_station: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. NRT"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.terminal}</label>
              <input
                type="text"
                value={formData.arrival_terminal}
                onChange={e => setFormData({ ...formData, arrival_terminal: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. 1"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Notes</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors min-h-[80px]"
            placeholder="Booking reference, seat number, etc."
          />
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
    </div>
  );
}
