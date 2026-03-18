import React, { useState } from 'react';
import { X, Footprints, Bus, Train, Ship, Car, Clock, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Itinerary } from '../types';

interface NextTransportFormProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: Itinerary;
  onSave: (data: { next_transport_mode: string; next_transport_time: string; next_transport_auto_time: string }) => Promise<void>;
}

const TRANSPORT_MODES = [
  { id: 'WALKING', label: 'Walk', icon: Footprints },
  { id: 'BUS', label: 'Bus', icon: Bus },
  { id: 'TRAIN', label: 'Train', icon: Train },
  { id: 'SHIP', label: 'Ship', icon: Ship },
  { id: 'DRIVING', label: 'Drive', icon: Car },
  { id: 'TAXI', label: 'Taxi', icon: Car },
];

export function NextTransportForm({ isOpen, onClose, itinerary, onSave }: NextTransportFormProps) {
  const [mode, setMode] = useState(itinerary.next_transport_mode || '');
  
  // 如果原本有手動設定時間，就解析出來；如果是 Auto 或空，預設為 0
  const initialMins = itinerary.next_transport_time ? parseInt(itinerary.next_transport_time.replace(/\D/g, '')) : 0;
  const [duration, setDuration] = useState<number>(initialMins);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave({
        next_transport_mode: mode,
        // 💡 Duration 為 0 代表交給 Google Maps 自動計算
        next_transport_time: duration === 0 ? '' : `${duration} min`,
        next_transport_auto_time: duration === 0 ? 'Auto' : ''
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setMode('');
    setDuration(0);
    setLoading(true);
    try {
      await onSave({ next_transport_mode: '', next_transport_time: '', next_transport_auto_time: '' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-bold text-white">Next Transport</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800 transition-colors"><X size={20} /></button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Transport Mode</label>
            <div className="grid grid-cols-3 gap-3">
              {TRANSPORT_MODES.map(m => {
                const Icon = m.icon;
                const isActive = mode === m.id;
                return (
                  <button
                    key={m.id} type="button"
                    onClick={() => setMode(m.id)}
                    className={clsx(
                      "flex flex-col items-center justify-center py-4 rounded-2xl border transition-all",
                      isActive ? "bg-orange-500/20 border-orange-500 text-orange-500 shadow-sm" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                    )}
                  >
                    <Icon size={24} className="mb-2" />
                    <span className="text-xs font-bold">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {mode && (
            <div className="space-y-4 bg-zinc-950/50 p-5 rounded-2xl border border-zinc-800">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
                <span className="flex items-center gap-1.5"><Clock size={14} className="text-orange-500" /> Travel Duration</span>
                <div className="flex items-center gap-2">
                  {duration === 0 ? (
                     <span className="text-orange-500 font-bold px-2 py-1">Auto</span>
                  ) : (
                    <>
                      <input 
                        type="number" value={duration} onChange={e => setDuration(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-right text-orange-500 font-bold focus:outline-none focus:border-orange-500 transition-colors"
                      />
                      <span className="text-zinc-500 text-[10px] font-bold">MIN</span>
                    </>
                  )}
                </div>
              </label>
              <div className="pt-2">
                <input 
                  type="range" min="0" max="240" step="5" value={Math.min(duration, 240)} onChange={e => setDuration(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 font-mono mt-2 px-1">
                  <span>Auto</span><span>1h</span><span>2h</span><span>3h</span><span>4h+</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex gap-3">
          <button onClick={handleClear} disabled={loading || !itinerary.next_transport_mode} className="flex-1 py-4 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-500 font-bold rounded-xl transition-colors disabled:opacity-50">Clear</button>
          <button onClick={handleSave} disabled={loading || !mode} className="flex-[2] py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-colors disabled:opacity-50 flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Save Transport'}
          </button>
        </div>
      </div>
    </div>
  );
}