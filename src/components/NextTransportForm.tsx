import React, { useState } from 'react';
import { X } from 'lucide-react';

interface NextTransportFormProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: any;
  onSave: (data: any) => void;
}

export function NextTransportForm({ isOpen, onClose, itinerary, onSave }: NextTransportFormProps) {
  const [mode, setMode] = useState(itinerary.next_transport_mode || '');
  const [time, setTime] = useState(itinerary.next_transport_time || '');
  const [autoTime, setAutoTime] = useState(itinerary.next_transport_auto_time || '');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Next Transportation</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-white">
              <option value="">Select Mode</option>
              <option value="WALKING">Walking</option>
              <option value="TRANSIT">Public Transit</option>
              <option value="DRIVING">Driving</option>
              <option value="TAXI">Taxi</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Time (Optional)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-white" />
          </div>
          <button 
            onClick={() => onSave({ next_transport_mode: mode, next_transport_time: time, next_transport_auto_time: autoTime })}
            className="w-full py-3 bg-orange-600 rounded-xl text-white font-bold hover:bg-orange-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
