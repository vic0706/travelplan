import React, { useState, useEffect } from 'react';
import { X, Plane, Calendar, Clock, MapPin, FileText, Loader2, Trash2, Train, Ship, Bus, Car, Search, Armchair, Hash } from 'lucide-react';
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
  { id: 'FERRY', label: 'Ferry', icon: Ship },
  { id: 'BUS', label: 'Bus', icon: Bus },
  { id: 'DRIVING', label: 'Driving', icon: Car },
] as const;

export function TransportationForm({ tripId, onSuccess, onCancel, onDelete, initialData }: TransportationFormProps) {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  
  // Helper to split ISO string into date and time
  const splitDateTime = (isoString?: string) => {
    if (!isoString) return { date: '', time: '' };
    try {
      const dateObj = new Date(isoString);
      if (isNaN(dateObj.getTime())) return { date: '', time: '' };
      return {
        date: format(dateObj, 'yyyy-MM-dd'),
        time: format(dateObj, 'HH:mm')
      };
    } catch (e) {
      return { date: '', time: '' };
    }
  };

  const initialDep = splitDateTime(initialData?.dep_time);
  const initialArr = splitDateTime(initialData?.arr_time);

  const [formData, setFormData] = useState({
    type: initialData?.type || 'FLIGHT',
    provider: initialData?.provider || '',
    code: initialData?.code || '',
    dep_station: initialData?.dep_station || '',
    dep_date: initialDep.date,
    dep_time_str: initialDep.time,
    arr_station: initialData?.arr_station || '',
    arr_date: initialArr.date,
    arr_time_str: initialArr.time,
    platform: initialData?.platform || '',
    seat_info: initialData?.seat_info || '',
    order_id: initialData?.order_id || '',
    notes: initialData?.notes || '',
    checkin_duration: initialData?.checkin_duration || 120,
    exit_duration: initialData?.exit_duration || 60,
    stay_duration: initialData?.stay_duration || 0,
  });

  const handleSearchFlight = async () => {
    if (!formData.code) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/api/flights/lookup?code=${encodeURIComponent(formData.code)}`);
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Flight not found');
        return;
      }
      const data = await res.json();
      
      setFormData(prev => ({
        ...prev,
        provider: data.airline || prev.provider,
        dep_station: data.departure_airport || prev.dep_station,
        dep_date: data.departure_date || prev.dep_date,
        dep_time_str: data.departure_time || prev.dep_time_str,
        arr_station: data.arrival_airport || prev.arr_station,
        arr_date: data.arrival_date || prev.arr_date,
        arr_time_str: data.arrival_time || prev.arr_time_str,
        platform: data.departure_terminal || prev.platform,
      }));
    } catch (error) {
      console.error(error);
      alert('Failed to lookup flight');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = initialData 
        ? `/api/trips/${tripId}/transportations/${initialData.id}` 
        : `/api/trips/${tripId}/transportations`;
      const method = initialData ? 'PUT' : 'POST';

      // Combine date and time
      const dep_time = `${formData.dep_date}T${formData.dep_time_str}`;
      const arr_time = `${formData.arr_date}T${formData.arr_time_str}`;

      const payload = {
        type: formData.type,
        provider: formData.provider,
        code: formData.code,
        dep_station: formData.dep_station,
        dep_time,
        arr_station: formData.arr_station,
        arr_time,
        platform: formData.platform,
        seat_info: formData.seat_info,
        order_id: formData.order_id,
        notes: formData.notes,
        checkin_duration: formData.checkin_duration,
        exit_duration: formData.exit_duration,
        stay_duration: formData.stay_duration,
      };

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
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
      case 'FLIGHT': return { provider: 'Airline', code: 'Flight No.', station: 'Airport', platform: 'Terminal' };
      case 'TRAIN': return { provider: 'Operator', code: 'Train No.', station: 'Station', platform: 'Platform' };
      case 'FERRY': return { provider: 'Operator', code: 'Vessel', station: 'Port', platform: 'Pier' };
      case 'BUS': return { provider: 'Operator', code: 'Bus No.', station: 'Station', platform: 'Platform' };
      default: return { provider: 'Provider', code: 'Reference', station: 'Location', platform: 'Point' };
    }
  };

  const labels = getLabels();
  // @ts-ignore
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
              // @ts-ignore
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
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder={`e.g. ${formData.type === 'FLIGHT' ? 'BR123' : '101'}`}
              />
              {formData.type === 'FLIGHT' && (
                <button
                  type="button"
                  onClick={handleSearchFlight}
                  disabled={searching || !formData.code}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white p-3 rounded-xl transition-colors disabled:opacity-50"
                  title="Search Flight"
                >
                  {searching ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                </button>
              )}
            </div>
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
                value={formData.dep_date ? new Date(formData.dep_date) : null}
                onChange={date => setFormData({ ...formData, dep_date: format(date, 'yyyy-MM-dd') })}
              />
            </div>
            <div className="space-y-2">
              <TimePicker
                label="Time"
                value={formData.dep_time_str}
                onChange={time => setFormData({ ...formData, dep_time_str: time })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.station}</label>
              <input
                type="text"
                required
                value={formData.dep_station}
                onChange={e => setFormData({ ...formData, dep_station: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. TPE"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.platform}</label>
              <input
                type="text"
                value={formData.platform}
                onChange={e => setFormData({ ...formData, platform: e.target.value })}
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
                value={formData.arr_date ? new Date(formData.arr_date) : null}
                onChange={date => setFormData({ ...formData, arr_date: format(date, 'yyyy-MM-dd') })}
              />
            </div>
            <div className="space-y-2">
              <TimePicker
                label="Time"
                value={formData.arr_time_str}
                onChange={time => setFormData({ ...formData, arr_time_str: time })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.station}</label>
            <input
              type="text"
              required
              value={formData.arr_station}
              onChange={e => setFormData({ ...formData, arr_station: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="e.g. NRT"
            />
          </div>
        </div>

        {/* Seat & Order Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Armchair size={12} /> Seat Info
            </label>
            <input
              type="text"
              value={formData.seat_info}
              onChange={e => setFormData({ ...formData, seat_info: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="e.g. 13A"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Hash size={12} /> Order ID
            </label>
            <input
              type="text"
              value={formData.order_id}
              onChange={e => setFormData({ ...formData, order_id: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="e.g. #123456"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Notes</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors min-h-[80px]"
            placeholder="Additional notes..."
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
