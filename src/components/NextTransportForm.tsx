import React, { useState, useEffect } from 'react';
import { X, Footprints, Bus, Train, Ship, Car, Clock, Loader2, MapPin } from 'lucide-react';
import { clsx } from 'clsx';
import { Itinerary } from '../types';
import { apiFetch } from '../utils/api';

interface NextTransportFormProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: Itinerary;
  nextItinerary?: Itinerary;
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

export function NextTransportForm({ isOpen, onClose, itinerary, nextItinerary, onSave }: NextTransportFormProps) {
  const [mode, setMode] = useState(itinerary.next_transport_mode || '');
  
  const initialMins = itinerary.next_transport_time ? parseInt(itinerary.next_transport_time.replace(/\D/g, '')) : 0;
  const [duration, setDuration] = useState<number>(initialMins);
  const [loading, setLoading] = useState(false);
  
  const [originCoords, setOriginCoords] = useState('');
  const [destCoords, setDestCoords] = useState('');
  const [fetchingCoords, setFetchingCoords] = useState(false);

  useEffect(() => {
    if (itinerary.next_transport_auto_time && itinerary.next_transport_auto_time.includes('|')) {
       const [o, d] = itinerary.next_transport_auto_time.split('|');
       setOriginCoords(o);
       setDestCoords(d);
    }
  }, [itinerary]);

  useEffect(() => {
    if (duration === 0 && mode && (!originCoords || !destCoords)) {
      const fetchGeocode = async () => {
        setFetchingCoords(true);
        try {
          if (!originCoords) {
             const oAddr = itinerary.address || `${itinerary.city_name || ''} ${itinerary.title}`;
             const oRes = await apiFetch(`/api/geocode?address=${encodeURIComponent(oAddr)}`);
             if (oRes.ok) {
                const oData = await oRes.json() as any;
                if (oData.lat) setOriginCoords(`${oData.lat},${oData.lng}`);
             }
          }
          if (!destCoords && nextItinerary) {
             const dAddr = nextItinerary.address || `${nextItinerary.city_name || ''} ${nextItinerary.title}`;
             const dRes = await apiFetch(`/api/geocode?address=${encodeURIComponent(dAddr)}`);
             if (dRes.ok) {
                const dData = await dRes.json() as any;
                if (dData.lat) setDestCoords(`${dData.lat},${dData.lng}`);
             }
          }
        } catch (e) { console.error("Geocode failed"); }
        setFetchingCoords(false);
      };
      fetchGeocode();
    }
  }, [duration, mode, originCoords, destCoords, itinerary, nextItinerary]);

  if (!isOpen) return null;

  const handleSave = async () => {
    // 💡 放寬限制：允許空值。如果有填寫，才檢查格式。
    if (duration === 0) {
       const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
       if (originCoords && !coordRegex.test(originCoords.trim())) {
           alert('起點經緯度格式錯誤！\n請輸入純數字格式，例如：25.0330, 121.5654');
           return;
       }
       if (destCoords && !coordRegex.test(destCoords.trim())) {
           alert('終點經緯度格式錯誤！\n請輸入純數字格式，例如：25.0330, 121.5654');
           return;
       }
    }

    setLoading(true);
    try {
      const safeOrigin = originCoords ? originCoords.replace(/\s/g,'') : '';
      const safeDest = destCoords ? destCoords.replace(/\s/g,'') : '';
      
      await onSave({
        next_transport_mode: mode,
        next_transport_time: duration === 0 ? '' : `${duration} min`,
        // 只有在 Auto 模式且至少有填寫其中一個時，才存入 auto_time
        next_transport_auto_time: duration === 0 && (safeOrigin || safeDest) ? `${safeOrigin}|${safeDest}` : ''
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setMode('');
    setDuration(0);
    setOriginCoords('');
    setDestCoords('');
    setLoading(true);
    try {
      await onSave({ next_transport_mode: '', next_transport_time: '', next_transport_auto_time: '' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 shrink-0">
          <h3 className="text-lg font-bold text-white">Next Transport</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800 transition-colors"><X size={20} /></button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
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
                     <span className="text-orange-500 font-bold px-2 py-1 bg-orange-500/10 rounded-md">AUTO (Maps)</span>
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

          {mode && duration === 0 && (
             <div className="space-y-4 bg-orange-500/5 p-5 rounded-2xl border border-orange-500/20">
                <div className="flex items-center justify-between">
                   <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wider flex items-center gap-1.5">
                     <MapPin size={14} /> Map Coordinates <span className="text-[9px] text-orange-400/70 ml-1">(Optional)</span>
                   </h4>
                   {fetchingCoords && <Loader2 size={14} className="animate-spin text-orange-500" />}
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 block">Origin Coordinates (Lat, Lng)</label>
                    <input 
                      type="text" value={originCoords} onChange={e => setOriginCoords(e.target.value)}
                      placeholder="e.g., 25.0330, 121.5654"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 block">Destination Coordinates (Lat, Lng)</label>
                    <input 
                      type="text" value={destCoords} onChange={e => setDestCoords(e.target.value)}
                      placeholder="e.g., 25.0430, 121.5554"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                    If left empty, the system will automatically parse the address/URL.
                  </p>
                </div>
             </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex gap-3 shrink-0">
          <button onClick={handleClear} disabled={loading || !itinerary.next_transport_mode} className="flex-1 py-4 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-500 font-bold rounded-xl transition-colors disabled:opacity-50">Clear</button>
          <button onClick={handleSave} disabled={loading || !mode} className="flex-[2] py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-colors disabled:opacity-50 flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Save Transport'}
          </button>
        </div>
      </div>
    </div>
  );
}