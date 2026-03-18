import React, { useState } from 'react';
import { X, Plane, Train, Ship, Search, Hash, Loader2, Trash2, Car, Clock } from 'lucide-react';
import { format, parseISO, addMinutes, subMinutes } from 'date-fns';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';
import { ConfirmDialog } from './ConfirmDialog';
import { apiFetch } from '../utils/api';
import { Transportation } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

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
  { id: 'PRIVATE_TRANSFER', label: 'Car', icon: Car },
] as const;

export function TransportationForm({ tripId, onSuccess, onCancel, onDelete, initialData }: TransportationFormProps) {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState(initialData ? 'form' : 'select');
  const [overlapConflict, setOverlapConflict] = useState<string | null>(null);
  
  const transportations = useLiveQuery(() => db.transportations.where('trip_id').equals(tripId).toArray(), [tripId]) || [];

  const [formData, setFormData] = useState({
    type: initialData?.type || 'FLIGHT',
    provider: initialData?.provider || '',
    code: initialData?.code || '',
    dep_station: initialData?.dep_station || '',
    dep_date: initialData?.dep_date || format(new Date(), 'yyyy-MM-dd'),
    dep_time: initialData?.dep_time || '10:00',
    dep_terminal: initialData?.dep_terminal || '',
    dep_checkin_buffer: initialData?.dep_checkin_buffer ?? 120,
    arr_station: initialData?.arr_station || '',
    arr_date: initialData?.arr_date || format(new Date(), 'yyyy-MM-dd'),
    arr_time: initialData?.arr_time || '14:00',
    arr_terminal: initialData?.arr_terminal || '',
    arr_exit_buffer: initialData?.arr_exit_buffer ?? 60,
    order_id: initialData?.order_id || '',
    notes: initialData?.notes || '',
  });

  const checkOverlap = () => {
    const depDateTime = parseISO(`${formData.dep_date}T${formData.dep_time}`);
    const arrDateTime = parseISO(`${formData.arr_date}T${formData.arr_time}`);

    if (isNaN(depDateTime.getTime()) || isNaN(arrDateTime.getTime())) return null;

    const newStart = subMinutes(depDateTime, formData.dep_checkin_buffer);
    const newEnd = addMinutes(arrDateTime, formData.arr_exit_buffer);

    for (const t of transportations) {
      if (initialData && t.id === initialData.id) continue;

      const tDepDateTime = parseISO(`${t.dep_date}T${t.dep_time}`);
      const tArrDateTime = parseISO(`${t.arr_date}T${t.arr_time}`);

      if (isNaN(tDepDateTime.getTime()) || isNaN(tArrDateTime.getTime())) continue;

      const tStart = subMinutes(tDepDateTime, t.dep_checkin_buffer || 0);
      const tEnd = addMinutes(tArrDateTime, t.arr_exit_buffer || 0);

      if (newStart < tEnd && newEnd > tStart) {
        return `${t.provider} ${t.code}`;
      }
    }
    return null;
  };

  const handleSearchFlight = async () => {
    if (!formData.code) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/api/flights/lookup?code=${encodeURIComponent(formData.code)}`);
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        alert(err.error || 'Flight not found');
        return;
      }
      const data = await res.json() as any;
      
      setFormData(prev => ({
        ...prev,
        provider: data.airline || prev.provider,
        dep_station: data.departure_airport || prev.dep_station,
        dep_date: data.departure_date || prev.dep_date,
        dep_time: data.departure_time || prev.dep_time,
        dep_terminal: data.departure_terminal || prev.dep_terminal,
        arr_station: data.arrival_airport || prev.arr_station,
        arr_date: data.arrival_date || prev.arr_date,
        arr_time: data.arrival_time || prev.arr_time,
        arr_terminal: data.arrival_terminal || prev.arr_terminal,
      }));

      alert(`航班資訊已參考 ${format(new Date(), 'yyyy-MM-dd')} 自動填入。`);
    } catch (error) {
      console.error(error);
      alert('Failed to lookup flight');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, bypassCheck = false) => {
    if (e) e.preventDefault();

    if (!bypassCheck) {
      const overlap = checkOverlap();
      if (overlap && !overlapConflict) {
        setOverlapConflict(overlap);
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = initialData 
        ? `/api/trips/${tripId}/transportations/${initialData.id}` 
        : `/api/trips/${tripId}/transportations`;
      const method = initialData ? 'PUT' : 'POST';

      const submissionData = {
        trip_id: tripId,
        type: formData.type || 'FLIGHT',
        provider: formData.provider || null,
        
        code: formData.code || null,
        transport_code: formData.code || null,
        
        dep_station: formData.dep_station || '',
        departure_station: formData.dep_station || '',
        
        dep_date: formData.dep_date || format(new Date(), 'yyyy-MM-dd'),
        departure_date: formData.dep_date || format(new Date(), 'yyyy-MM-dd'),
        
        dep_time: formData.dep_time || '10:00',
        departure_time: formData.dep_time || '10:00',
        
        dep_terminal: formData.dep_terminal || null,
        departure_terminal: formData.dep_terminal || null,
        
        dep_checkin_buffer: formData.dep_checkin_buffer ?? 120,
        
        arr_station: formData.arr_station || '',
        arrival_station: formData.arr_station || '',
        
        arr_date: formData.arr_date || format(new Date(), 'yyyy-MM-dd'),
        arrival_date: formData.arr_date || format(new Date(), 'yyyy-MM-dd'),
        
        arr_time: formData.arr_time || '14:00',
        arrival_time: formData.arr_time || '14:00',
        
        arr_terminal: formData.arr_terminal || null,
        arrival_terminal: formData.arr_terminal || null,
        
        arr_exit_buffer: formData.arr_exit_buffer ?? 60,
        
        order_id: formData.order_id || null,
        notes: formData.notes || null,
      };

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(submissionData)
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to add/update transportation:', errorData);
        throw new Error(`Failed to ${initialData ? 'update' : 'add'} transportation: ${JSON.stringify(errorData)}`);
      }
      onSuccess();
    } catch (error) {
      console.error(error);
      alert(`Failed to ${initialData ? 'update' : 'add'} transportation: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const getLabels = () => {
    switch (formData.type) {
      case 'FLIGHT': return { provider: 'Airline', code: 'Flight No.', station: 'Airport', terminal: 'Terminal' };
      case 'TRAIN': return { provider: 'Operator', code: 'Train No.', station: 'Station', terminal: 'Platform' };
      case 'FERRY': return { provider: 'Operator', code: 'Vessel', station: 'Port', terminal: 'Pier' };
      case 'PRIVATE_TRANSFER': return { provider: 'Service', code: 'Plate No.', station: 'Location', terminal: 'Point' };
      default: return { provider: 'Provider', code: 'Reference', station: 'Location', terminal: 'Point' };
    }
  };

  const labels = getLabels();
  // @ts-ignore
  const CurrentIcon = TRANSPORT_TYPES.find(t => t.id === formData.type)?.icon || Plane;

  if (step === 'select') {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white">Select Transportation</h3>
          <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {TRANSPORT_TYPES.map(type => (
            <button
              key={type.id}
              // @ts-ignore
              onClick={() => { setFormData({ ...formData, type: type.id }); setStep('form'); }}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-zinc-800 hover:bg-zinc-700 transition-colors border border-zinc-700 hover:border-orange-500 group"
            >
              <type.icon size={32} className="text-zinc-400 group-hover:text-orange-500 transition-colors" />
              <span className="text-sm font-bold text-white">{type.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

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
          <div className="space-y-2 relative">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.code}</label>
            <div className="relative">
              <input
                type="text"
                required
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder={`e.g. ${formData.type === 'FLIGHT' ? 'BR123' : '101'}`}
              />
              {formData.type === 'FLIGHT' && (
                <button
                  type="button"
                  onClick={handleSearchFlight}
                  disabled={searching || !formData.code}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-white disabled:opacity-50"
                  title="Search Flight"
                >
                  {searching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Departure */}
        <div className="space-y-4 border border-zinc-800/50 rounded-2xl p-4 bg-zinc-950/30">
          <h4 className="text-sm font-semibold text-orange-500 uppercase tracking-wider">Departure</h4>
          
          <div className="space-y-2">
             <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
               <span>Check-in Buffer</span>
               <div className="flex items-center gap-2">
                 {formData.dep_date && formData.dep_time && !isNaN(parseISO(`${formData.dep_date}T${formData.dep_time}`).getTime()) && (
                   <span className="text-orange-500/80 text-[10px] font-mono mr-2">
                     {format(subMinutes(parseISO(`${formData.dep_date}T${formData.dep_time}`), formData.dep_checkin_buffer || 0), 'HH:mm')}
                   </span>
                 )}
                 <input 
                   type="number"
                   value={formData.dep_checkin_buffer}
                   onChange={(e) => setFormData({...formData, dep_checkin_buffer: parseInt(e.target.value) || 0})}
                   className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-orange-500 font-bold focus:outline-none focus:border-orange-500"
                 />
                 <span className="text-zinc-500 text-[10px]">MIN</span>
               </div>
             </label>
             <input 
               type="range" 
               min="0" 
               max="240" 
               step="15"
               value={formData.dep_checkin_buffer}
               onChange={(e) => setFormData({...formData, dep_checkin_buffer: parseInt(e.target.value)})}
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
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Time
              </label>
              <input
                type="time"
                value={formData.dep_time}
                onChange={e => setFormData({ ...formData, dep_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
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
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.terminal}</label>
              <input
                type="text"
                value={formData.dep_terminal}
                onChange={e => setFormData({ ...formData, dep_terminal: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. 2"
              />
            </div>
          </div>
        </div>

        {/* Arrival */}
        <div className="space-y-4 border border-zinc-800/50 rounded-2xl p-4 bg-zinc-950/30">
          <h4 className="text-sm font-semibold text-orange-500 uppercase tracking-wider">Arrival</h4>
          
          <div className="space-y-2">
             <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
               <span>Exit Buffer</span>
               <div className="flex items-center gap-2">
                 {formData.arr_date && formData.arr_time && !isNaN(parseISO(`${formData.arr_date}T${formData.arr_time}`).getTime()) && (
                   <span className="text-orange-500/80 text-[10px] font-mono mr-2">
                     {format(addMinutes(parseISO(`${formData.arr_date}T${formData.arr_time}`), formData.arr_exit_buffer || 0), 'HH:mm')}
                   </span>
                 )}
                 <input 
                   type="number"
                   value={formData.arr_exit_buffer}
                   onChange={(e) => setFormData({...formData, arr_exit_buffer: parseInt(e.target.value) || 0})}
                   className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-orange-500 font-bold focus:outline-none focus:border-orange-500"
                 />
                 <span className="text-zinc-500 text-[10px]">MIN</span>
               </div>
             </label>
             <input 
               type="range" 
               min="0" 
               max="240" 
               step="15"
               value={formData.arr_exit_buffer}
               onChange={(e) => setFormData({...formData, arr_exit_buffer: parseInt(e.target.value)})}
               className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
             />
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
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Time
              </label>
              <input
                type="time"
                value={formData.arr_time}
                onChange={e => setFormData({ ...formData, arr_time: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{labels.terminal}</label>
              <input
                type="text"
                value={formData.arr_terminal}
                onChange={e => setFormData({ ...formData, arr_terminal: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. 1"
              />
            </div>
          </div>
        </div>

        {/* Order Info */}
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

      <ConfirmDialog
        isOpen={!!overlapConflict}
        title="時間重疊警告"
        message={`此交通工具的時間段（包含緩衝時間）與現有的「${overlapConflict}」重疊。您確定要繼續儲存嗎？`}
        confirmText="確定繼續"
        cancelText="返回修改"
        type="warning"
        onConfirm={() => {
          setOverlapConflict(null);
          // Re-trigger submit without event to skip check
          handleSubmit(undefined, true);
        }}
        onCancel={() => setOverlapConflict(null)}
      />
    </div>
  );
}
