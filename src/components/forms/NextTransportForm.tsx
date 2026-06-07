import React, { useState, useEffect, useCallback } from 'react';
import { X, Footprints, Bus, Car, Bike, Clock, Loader2, Sparkles, Motorbike, Pencil } from 'lucide-react';
import { clsx } from 'clsx';
import { Itinerary } from '../../types';
import { motion } from 'framer-motion';
import { apiFetch } from '../../utils/api';

interface NextTransportFormProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: Itinerary | null | undefined;
  nextItinerary?: Itinerary | null;
  onSave: (data: {
    next_transport_mode: string;
    next_transport_time: string;
    next_transport_auto_time: string;
    next_transport_haversine_time: string;
    next_transport_resolved_mode: string;
  }) => Promise<void>;
}

const TRANSPORT_MODES = [
  { id: 'AUTO',         label: '自動',    icon: Sparkles },
  { id: 'DRIVING',      label: '開車',    icon: Car },
  { id: 'TRANSIT',      label: '大眾運輸', icon: Bus },
  { id: 'WALKING',      label: '步行',    icon: Footprints },
  { id: 'BICYCLING',    label: '自行車',  icon: Bike },
  { id: 'MOTORCYCLING', label: '機車',    icon: Motorbike },
  { id: 'CUSTOM',       label: '自訂',    icon: Pencil },
];

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Matches optimizer.ts HEURISTIC_SPEED (circuity 1.4× applied here)
const HEURISTIC: Record<string, { speed: number; buffer: number }> = {
  DRIVING:      { speed: 3,  buffer: 8  },
  TRANSIT:      { speed: 5,  buffer: 10 },
  WALKING:      { speed: 15, buffer: 5  },
  BICYCLING:    { speed: 8,  buffer: 5  },
  MOTORCYCLING: { speed: 3,  buffer: 5  },
};
const ROAD_CIRCUITY = 1.4;

function haversineEstimate(dist: number, mode: string): number {
  const h = HEURISTIC[mode] || HEURISTIC.DRIVING;
  return Math.ceil(dist * ROAD_CIRCUITY * h.speed) + h.buffer;
}

function fastestHaversineMode(dist: number): string {
  return Object.entries(HEURISTIC)
    .map(([m, h]) => ({ m, t: Math.ceil(dist * ROAD_CIRCUITY * h.speed) + h.buffer }))
    .sort((a, b) => a.t - b.t)[0].m;
}

export function NextTransportForm({ isOpen, onClose, itinerary, nextItinerary, onSave }: NextTransportFormProps) {
  const [mode, setMode] = useState('DRIVING');
  const [duration, setDuration] = useState<number>(15);
  const [loading, setLoading] = useState(false);

  // Haversine estimates for all modes (instant, free)
  const [estimates, setEstimates] = useState<Record<string, number>>({});
  // Accurate API time for the currently selected mode
  const [accurateMins, setAccurateMins] = useState<number | null>(null);
  const [loadingAccurate, setLoadingAccurate] = useState(false);

  // Compute haversine estimates when form opens
  useEffect(() => {
    if (!isOpen) return;
    const from = itinerary;
    const to = nextItinerary;
    if (from?.lat && from?.lng && to?.lat && to?.lng) {
      const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
      const est: Record<string, number> = {};
      for (const m of TRANSPORT_MODES) {
        if (m.id !== 'CUSTOM') est[m.id] = haversineEstimate(dist, m.id);
      }
      setEstimates(est);
    } else {
      setEstimates({});
    }
  }, [isOpen, itinerary?.lat, itinerary?.lng, nextItinerary?.lat, nextItinerary?.lng]);

  // Fetch accurate travel time for selected mode via Compute Routes API
  const fetchAccurateTime = useCallback(async (selectedMode: string) => {
    if (selectedMode === 'CUSTOM') { setAccurateMins(null); return; }
    const from = itinerary;
    const to = nextItinerary;
    if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) { setAccurateMins(null); return; }

    setLoadingAccurate(true);
    setAccurateMins(null);
    try {
      const res = await apiFetch('/api/travel-time', {
        method: 'POST',
        body: JSON.stringify({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng, mode: selectedMode }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        setAccurateMins(data.mins ?? null);
      }
    } catch { /* silent */ }
    finally { setLoadingAccurate(false); }
  }, [itinerary?.lat, itinerary?.lng, nextItinerary?.lat, nextItinerary?.lng]);

  // Load existing data and trigger API fetch when form opens
  useEffect(() => {
    if (!isOpen || !itinerary) return;
    const storedMode = (itinerary.next_transport_mode || 'AUTO').toUpperCase();
    const isAutoMode = storedMode === 'AUTO' || itinerary.next_transport_time === 'auto';

    let initialMode = isAutoMode ? 'AUTO' : storedMode;
    let initialDuration = 0;

    if (!isAutoMode) {
      const mins = itinerary.next_transport_time
        ? parseInt(itinerary.next_transport_time.replace(/\D/g, ''))
        : 15;
      initialDuration = mins || 15;
    }

    setMode(initialMode);
    setDuration(initialDuration);
    setAccurateMins(null);
    if (initialMode !== 'AUTO') fetchAccurateTime(initialMode);
  }, [isOpen, itinerary?.id]);

  // Fetch accurate time when mode changes (skip for AUTO and CUSTOM)
  useEffect(() => {
    if (!isOpen || mode === 'AUTO' || mode === 'CUSTOM') return;
    fetchAccurateTime(mode);
  }, [mode, isOpen]);

  if (!isOpen || !itinerary) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      const isAutoMode = mode === 'AUTO';
      const isAutoTime = isAutoMode || duration === 0;

      // Compute haversine estimate for saving
      const from = itinerary;
      const to = nextItinerary;
      let haversineTime = '';
      if (from?.lat && from?.lng && to?.lat && to?.lng) {
        const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
        if (isAutoMode) {
          haversineTime = String(haversineEstimate(dist, fastestHaversineMode(dist)));
        } else if (mode !== 'CUSTOM') {
          haversineTime = String(haversineEstimate(dist, mode));
        }
      }

      await onSave({
        next_transport_mode: mode,
        next_transport_time: isAutoTime ? 'auto' : `${duration} min`,
        next_transport_auto_time: (!isAutoMode && isAutoTime && accurateMins !== null) ? String(accurateMins) : '',
        next_transport_haversine_time: haversineTime,
        next_transport_resolved_mode: '', // cleared on user edit; optimizer will re-resolve on next run
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      await onSave({ next_transport_mode: '', next_transport_time: '', next_transport_auto_time: '', next_transport_haversine_time: '', next_transport_resolved_mode: '' });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const hasCoords = !!(itinerary.lat && itinerary.lng && nextItinerary?.lat && nextItinerary?.lng);

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 sm:p-0 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[#1c1c1e] border border-zinc-800 rounded-[36px] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-[#242426] shrink-0">
          <div>
            <h3 className="font-black text-white text-base uppercase tracking-widest">前往下一站</h3>
            <p className="text-[10px] text-zinc-500 font-bold mt-1 truncate max-w-[200px]">離開 {itinerary.title}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {/* Transport Mode Grid */}
          <div className="grid grid-cols-4 gap-2">
            {TRANSPORT_MODES.map(m => {
              const Icon = m.icon;
              const isActive = mode === m.id;
              const est = estimates[m.id];
              const showAccurate = isActive && accurateMins !== null && m.id !== 'CUSTOM' && m.id !== 'AUTO';
              const showLoading  = isActive && loadingAccurate && m.id !== 'CUSTOM' && m.id !== 'AUTO' && hasCoords;

              return (
                <button
                  key={m.id} type="button"
                  onClick={() => { setMode(m.id); if (m.id === 'AUTO') setDuration(0); }}
                  className={clsx(
                    "flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl border transition-all active:scale-95",
                    isActive
                      ? "bg-orange-500/10 border-orange-500/50 text-orange-500 shadow-inner"
                      : "bg-[#242426] border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-white hover:border-zinc-500"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="text-[9px] font-bold tracking-wide">{m.label}</span>
                  {/* Time estimate below each mode */}
                  {m.id !== 'CUSTOM' && m.id !== 'AUTO' && (
                    <span className={clsx(
                      "text-[9px] font-bold leading-none",
                      isActive ? "text-orange-400" : "text-zinc-600"
                    )}>
                      {showLoading ? (
                        <Loader2 size={9} className="animate-spin inline" />
                      ) : showAccurate ? (
                        `${accurateMins}分`
                      ) : est ? (
                        `~${est}分`
                      ) : null}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* AUTO mode info banner */}
          {mode === 'AUTO' && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-orange-400 mb-1">
                <Sparkles size={12} /><span className="text-[11px] font-black">智慧選擇模式</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                執行智慧排序時，系統將計算所有交通方式，<br/>自動選擇最快路線
              </p>
              {hasCoords && (() => {
                const from = itinerary;
                const to = nextItinerary;
                if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return null;
                const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
                const best = fastestHaversineMode(dist);
                const bestLabel = TRANSPORT_MODES.find(x => x.id === best)?.label ?? best;
                const bestTime = haversineEstimate(dist, best);
                return (
                  <p className="text-[10px] text-orange-400/70 mt-1.5 font-bold">
                    目前估算最快：{bestLabel} ~{bestTime}分
                  </p>
                );
              })()}
            </div>
          )}

          {/* Time Input Area — hidden when AUTO mode */}
          {mode !== 'AUTO' && (
          <div className="bg-[#242426] border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={12} className="text-orange-500" /> 預估交通時間
              </label>

              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
                {duration === 0 ? (
                  <div className="flex items-center gap-1.5 text-orange-500 animate-pulse">
                    <Sparkles size={14} />
                    <span className="text-sm font-black">自動</span>
                  </div>
                ) : (
                  <>
                    <input
                      type="number" min="1" max="300"
                      inputMode="numeric" pattern="[0-9]*"
                      value={duration}
                      onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 bg-transparent text-white text-lg font-black text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-zinc-500 font-bold">分鐘</span>
                  </>
                )}
              </div>
            </div>

            <input
              type="range" min="0" max="120" step="5"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer outline-none bg-orange-500 accent-orange-500"
              style={{ accentColor: '#f97316' }}
            />

            <div className="flex justify-between text-[9px] text-zinc-600 font-bold px-1">
              <span className={clsx(duration === 0 && "text-orange-500")}>自動</span>
              <span>30分</span>
              <span>1時</span>
              <span>2時</span>
            </div>

            {duration === 0 && (
              <p className="text-[10px] text-orange-500/60 text-center font-bold italic">
                * 設定為 0 將由智慧排序根據距離自動計算
              </p>
            )}
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-800 bg-[#1c1c1e] flex gap-3 shrink-0">
          <button
            onClick={handleClear}
            disabled={loading || !itinerary.next_transport_mode}
            className="flex-1 py-4 bg-[#242426] hover:bg-red-500/10 text-zinc-400 hover:text-red-500 font-bold rounded-2xl transition-colors text-xs uppercase tracking-widest"
          >
            清除
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-[2] py-4 bg-orange-500 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all text-white shadow-orange-500/10 hover:bg-orange-600"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : '確認儲存'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
