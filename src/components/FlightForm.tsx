import React, { useState } from 'react';
import { X, Plane, Calendar, Clock, MapPin, FileText, Loader2 } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';
import { apiFetch } from '../utils/api';
import { Flight } from '../types';

interface FlightFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function FlightForm({ tripId, onSuccess, onCancel }: FlightFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    airline: '',
    flight_code: '',
    departure_date: '',
    departure_time: '',
    departure_airport: '',
    departure_terminal: '',
    checkin_duration: 120, // Default 2 hours
    arrival_date: '',
    arrival_time: '',
    arrival_airport: '',
    arrival_terminal: '',
    exit_duration: 60, // Default 1 hour
    stay_duration: 0,
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/flights`, {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Failed to add flight');
      onSuccess();
    } catch (error) {
      console.error(error);
      alert('Failed to add flight');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto pb-safe-bottom">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Plane className="text-orange-500" size={20} />
          Add Flight
        </h3>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Airline & Flight Number */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Airline</label>
            <input
              type="text"
              required
              value={formData.airline}
              onChange={e => setFormData({ ...formData, airline: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="e.g. EVA Air"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Flight No.</label>
            <input
              type="text"
              required
              value={formData.flight_code}
              onChange={e => setFormData({ ...formData, flight_code: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="e.g. BR123"
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
                onChange={date => setFormData({ ...formData, departure_date: date.toISOString().split('T')[0] })}
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
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Airport Code</label>
              <input
                type="text"
                required
                value={formData.departure_airport}
                onChange={e => setFormData({ ...formData, departure_airport: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. TPE"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Terminal</label>
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
                onChange={date => setFormData({ ...formData, arrival_date: date.toISOString().split('T')[0] })}
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
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Airport Code</label>
              <input
                type="text"
                required
                value={formData.arrival_airport}
                onChange={e => setFormData({ ...formData, arrival_airport: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="e.g. NRT"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Terminal</label>
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
            {loading ? <Loader2 className="animate-spin" /> : 'Add Flight'}
          </button>
        </div>
      </form>
    </div>
  );
}
