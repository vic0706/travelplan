import React, { useState, useEffect } from 'react';
import { X, Footprints, Bus, Car, Train, Ship, Clock } from 'lucide-react';
import { clsx } from 'clsx';

interface NextTransportFormProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: any;
  onSave: (data: any) => void;
}

const TRANSPORT_MODES = [
  { id: 'WALKING', label: 'Walking', icon: Footprints },
  { id: 'TRANSIT', label: 'Transit', icon: Bus },
  { id: 'DRIVING', label: 'Driving', icon: Car },
  { id: 'TAXI', label: 'Taxi', icon: Car },
  { id: 'TRAIN', label: 'Train', icon: Train },
  { id: 'SHIP', label: 'Ferry', icon: Ship },
];

export function NextTransportForm({ isOpen, onClose, itinerary, onSave }: NextTransportFormProps) {
  const [mode, setMode] = useState(itinerary.next_transport_mode || '');
  // Parse existing time string to minutes if possible, otherwise default to empty
  const initialDuration = itinerary.next_transport_time ? parseInt(itinerary.next_transport_time) : '';
  const [duration, setDuration] = useState<number | string>(initialDuration || '');

  useEffect(() => {
    if (isOpen) {
      setMode(itinerary.next_transport_mode || '');
      const timeStr = itinerary.next_transport_time || '';
      const minutes = parseInt(timeStr);
      setDuration(isNaN(minutes) ? '' : minutes);
    }
  }, [isOpen, itinerary]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ 
      next_transport_mode: mode, 
      next_transport_time: duration ? `${duration} min` : '',
      next_transport_auto_time: '' // Clear auto time if manual is set
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Next Transport</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-8">
          {/* Transport Mode Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Transport Mode</label>
            <div className="grid grid-cols-3 gap-3">
              {TRANSPORT_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={clsx(
                    "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all duration-200",
                    mode === m.id
                      ? "bg-orange-500/10 border-orange-500 text-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.1)]"
                      : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-200"
                  )}
                >
                  <m.icon size={24} strokeWidth={1.5} />
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Duration Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} />
                Travel Duration
              </label>
              <span className={clsx(
                "font-mono font-bold text-lg transition-colors",
                !duration ? "text-zinc-500" : "text-orange-500"
              )}>
                {duration ? `${duration} min` : 'Auto'}
              </span>
            </div>
            
            <div className="space-y-6">
              {/* Slider */}
              <div className="relative pt-1">
                <input
                  type="range"
                  min="0"
                  max="240"
                  step="5"
                  value={typeof duration === 'number' ? Math.min(duration, 240) : 0}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 font-mono mt-2 px-1">
                  <span>Auto</span>
                  <span>1h</span>
                  <span>2h</span>
                  <span>3h</span>
                  <span>4h+</span>
                </div>
              </div>

              {/* Manual Input */}
              <div className="relative">
                <input
                  type="number"
                  value={duration || ''}
                  onChange={(e) => setDuration(e.target.value === '' ? 0 : parseInt(e.target.value))}
                  placeholder="Auto (0 min)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">min</span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={!mode}
            className={clsx(
              "w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg mt-4",
              mode 
                ? "bg-orange-500 text-white hover:bg-orange-600 hover:shadow-orange-500/20 hover:scale-[1.02]" 
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            )}
          >
            Save Transport
          </button>
        </div>
      </div>
    </div>
  );
}
