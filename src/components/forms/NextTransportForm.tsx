import React, { useState, useEffect, useCallback } from 'react';
import { X, Footprints, Bus, Car, Bike, Clock, Loader2, Sparkles, Motorbike, Pencil, MapPin } from 'lucide-react';
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
    next_transport_custom_label: string;
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

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}時` : `${h}時${m}分`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Matches optimizer.ts HEURISTIC_SPEED — keep in sync when changing either
const HEURISTIC: Record<string, { speed: number; buffer: number }> = {
  DRIVING:      { speed: 1.2, buffer: 8  },
  TRANSIT:      { speed: 3.0, buffer: 12 },
  WALKING:      { speed: 13,  buffer: 3  },
  BICYCLING:    { speed: 5,   buffer: 5  },
  MOTORCYCLING: { speed: 1.2, buffer: 5  },
};
const ROAD_CIRCUITY = 1.3;

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
  const [mode, setMode] = useState('AUTO');
  const [isAutoTime, setIsAutoTime] = useState(true);
  const [duration, setDuration] = useState(15);
  const [customLabel, setCustomLabel] = useState('');
  const [loading, setLoading] = useState(false);

  // Haversine estimates for all modes (instant, free)
  const [estimates, setEstimates] = useState<Record<string, number>>({});
  // Google Maps time for selected specific mode (when isAutoTime=true)
  const [accurateMins, setAccurateMins] = useState<number | null>(null);
  const [loadingAccurate, setLoadingAccurate] = useState(false);
  // Google Maps time for AUTO mode's fastest haversine candidate
  const [autoAccurateMins, setAutoAccurateMins] = useState<number | null>(null);

  const hasCoords = !!(itinerary?.lat && itinerary?.lng && nextItinerary?.lat && nextItinerary?.lng);

  // Compute haversine estimates when form opens or coords change
  useEffect(() => {
    if (!isOpen) return;
    const from = itinerary, to = nextItinerary;
    if (from?.lat && from?.lng && to?.lat && to?.lng) {
      const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
      const est: Record<string, number> = {};
      for (const m of TRANSPORT_MODES) {
        if (m.id !== 'CUSTOM' && m.id !== 'AUTO') est[m.id] = haversineEstimate(dist, m.id);
      }
      setEstimates(est);
    } else {
      setEstimates({});
    }
  }, [isOpen, itinerary?.lat, itinerary?.lng, nextItinerary?.lat, nextItinerary?.lng]);

  // Fetch Google Maps time for selected specific mode (non-AUTO, non-CUSTOM, isAutoTime)
  const fetchAccurateTime = useCallback(async (selectedMode: string) => {
    const from = itinerary, to = nextItinerary;
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

  // Fetch Google Maps time for AUTO mode's fastest haversine candidate
  useEffect(() => {
    if (!isOpen || mode !== 'AUTO' || !hasCoords) { setAutoAccurateMins(null); return; }
    const from = itinerary, to = nextItinerary;
    if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return;
    const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
    const best = fastestHaversineMode(dist);
    setAutoAccurateMins(null);
    apiFetch('/api/travel-time', {
      method: 'POST',
      body: JSON.stringify({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng, mode: best }),
    }).then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.mins != null) setAutoAccurateMins(d.mins); })
      .catch(() => {});
  }, [isOpen, mode, itinerary?.lat, itinerary?.lng, nextItinerary?.lat, nextItinerary?.lng]);

  // Load existing data when form opens
  useEffect(() => {
    if (!isOpen || !itinerary) return;
    const storedMode = (itinerary.next_transport_mode || 'AUTO').toUpperCase();
    const isAutoMode = storedMode === 'AUTO';
    const storedIsAutoTime = isAutoMode || itinerary.next_transport_time === 'auto';
    const storedDuration = (() => {
      if (storedIsAutoTime || isAutoMode) return 15;
      const mins = parseInt((itinerary.next_transport_time || '').replace(/\D/g, ''));
      return mins || 15;
    })();

    setMode(isAutoMode ? 'AUTO' : storedMode);
    setIsAutoTime(isAutoMode ? true : storedIsAutoTime);
    setDuration(storedDuration);
    setCustomLabel((itinerary as any).next_transport_custom_label || '');
    setAccurateMins(null);
    setAutoAccurateMins(null);
  }, [isOpen, itinerary?.id]);

  // Fetch accurate time when mode or isAutoTime changes (specific mode + auto time only)
  useEffect(() => {
    if (!isOpen || mode === 'AUTO' || mode === 'CUSTOM' || !isAutoTime) {
      if (!isAutoTime) setAccurateMins(null);
      return;
    }
    fetchAccurateTime(mode);
  }, [mode, isOpen, isAutoTime]);

  if (!isOpen || !itinerary) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      const isAutoMode = mode === 'AUTO';
      const actualAutoTime = isAutoMode || isAutoTime;

      const from = itinerary, to = nextItinerary;
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
        next_transport_time: actualAutoTime ? 'auto' : `${duration} min`,
        next_transport_auto_time: (isAutoTime && !isAutoMode && accurateMins !== null) ? String(accurateMins) : '',
        next_transport_haversine_time: haversineTime,
        next_transport_resolved_mode: '',
        next_transport_custom_label: mode === 'CUSTOM' ? customLabel : '',
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      await onSave({
        next_transport_mode: '',
        next_transport_time: '',
        next_transport_auto_time: '',
        next_transport_haversine_time: '',
        next_transport_resolved_mode: '',
        next_transport_custom_label: '',
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // For AUTO mode banner: compute best mode info
  const autoBestInfo = (() => {
    if (mode !== 'AUTO' || !hasCoords || !itinerary?.lat) return null;
    const from = itinerary, to = nextItinerary;
    if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return null;
    const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
    const best = fastestHaversineMode(dist);
    const bestLabel = TRANSPORT_MODES.find(x => x.id === best)?.label ?? best;
    return { best, bestLabel, haversineTime: haversineEstimate(dist, best) };
  })();

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 sm:p-0 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-[#1c1c1e] border border-zinc-800 rounded-[36px] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header: from → to */}
        <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-[#242426] shrink-0">
          <div>
            <div className="flex items-center gap-1.5 font-black text-sm leading-snug">
              <span className="text-zinc-300 truncate max-w-[95px]">{itinerary.title}</span>
              <span className="text-zinc-600">→</span>
              <span className="text-orange-400 truncate max-w-[95px]">{nextItinerary?.title || '下一站'}</span>
            </div>
            <p className="text-[10px] text-zinc-600 font-bold mt-0.5">交通方式設定</p>
          </div>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Transport Mode Grid */}
          <div className="grid grid-cols-4 gap-2">
            {TRANSPORT_MODES.map(m => {
              const Icon = m.icon;
              const isActive = mode === m.id;
              const est = estimates[m.id];
              const showDualTime = isActive && isAutoTime && m.id !== 'CUSTOM' && m.id !== 'AUTO';

              return (
                <button
                  key={m.id} type="button"
                  onClick={() => { setMode(m.id); if (m.id === 'AUTO') setIsAutoTime(true); }}
                  className={clsx(
                    'flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl border transition-all active:scale-95',
                    isActive
                      ? 'bg-orange-500/10 border-orange-500/50 text-orange-500 shadow-inner'
                      : 'bg-[#242426] border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-white hover:border-zinc-500'
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="text-[9px] font-bold tracking-wide">{m.label}</span>
                  {/* Non-active: haversine only; Active + auto-time: haversine + Google Maps */}
                  {m.id !== 'CUSTOM' && m.id !== 'AUTO' && (
                    <div className="flex flex-col items-center leading-none gap-0.5">
                      <span className={clsx('text-[9px] font-bold', isActive ? 'text-orange-400' : 'text-zinc-600')}>
                        {est ? `~${formatDuration(est)}` : null}
                      </span>
                      {showDualTime && (
                        <span className="text-[9px] font-black text-orange-300 flex items-center gap-0.5">
                          {loadingAccurate
                            ? <Loader2 size={8} className="animate-spin" />
                            : accurateMins !== null
                              ? `=${formatDuration(accurateMins)}`
                              : hasCoords ? '…' : null}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* AUTO mode info banner */}
          {mode === 'AUTO' && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl px-4 py-3">
              <div className="flex items-center justify-center gap-1.5 text-orange-400 mb-2">
                <Sparkles size={12} /><span className="text-[11px] font-black">智慧選擇模式</span>
              </div>
              <p className="text-[10px] text-zinc-500 text-center leading-relaxed mb-2">
                執行智慧排序時，系統將計算所有交通方式，<br/>自動選擇最快路線
              </p>
              {autoBestInfo && (
                <div className="space-y-1.5 border-t border-orange-500/10 pt-2.5">
                  <p className="text-[10px] text-orange-400/80 text-center font-black mb-1.5">
                    目前估算最快：{autoBestInfo.bestLabel}
                  </p>
                  <div className="flex items-center justify-between text-[10px] px-1">
                    <span className="text-zinc-600 font-bold">📐 距離估算</span>
                    <span className="text-zinc-500 font-black">~{formatDuration(autoBestInfo.haversineTime)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] px-1">
                    <span className="text-zinc-600 font-bold">🗺 Google Maps</span>
                    <span className="text-orange-400 font-black flex items-center gap-1">
                      {autoAccurateMins !== null
                        ? <>{formatDuration(autoAccurateMins)} <Sparkles size={9} /></>
                        : hasCoords ? <Loader2 size={10} className="animate-spin" /> : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Time section — shown for all non-AUTO modes */}
          {mode !== 'AUTO' && (
            <div className="bg-[#242426] border border-zinc-800 rounded-2xl p-4 space-y-3">
              {/* 自動 / 手動 toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={12} className="text-orange-500" /> 交通時間
                </label>
                {mode !== 'CUSTOM' && (
                  <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setIsAutoTime(true)}
                      className={clsx('px-3 py-1 rounded-lg text-[10px] font-black transition-all',
                        isAutoTime ? 'bg-orange-500 text-white shadow' : 'text-zinc-500 hover:text-white')}
                    >
                      自動
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAutoTime(false)}
                      className={clsx('px-3 py-1 rounded-lg text-[10px] font-black transition-all',
                        !isAutoTime ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-white')}
                    >
                      手動
                    </button>
                  </div>
                )}
              </div>

              {/* Auto time: info text (actual times shown in mode button above) */}
              {(isAutoTime && mode !== 'CUSTOM') && (
                <p className="text-[10px] text-zinc-600 text-center font-bold italic pt-0.5">
                  {hasCoords ? '交通時間顯示在上方交通選項中' : '請為兩個活動加入位置以取得時間估算'}
                </p>
              )}

              {/* Manual time: number input + slider */}
              {(!isAutoTime || mode === 'CUSTOM') && (
                <>
                  <div className="flex items-center justify-end gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
                    <input
                      type="number" min="5" max="300"
                      inputMode="numeric" pattern="[0-9]*"
                      value={duration}
                      onChange={(e) => setDuration(Math.max(5, parseInt(e.target.value) || 5))}
                      className="w-12 bg-transparent text-white text-lg font-black text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-zinc-500 font-bold">分鐘</span>
                  </div>
                  <input
                    type="range" min="5" max="120" step="5"
                    value={Math.min(duration, 120)}
                    onChange={(e) => setDuration(parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer outline-none accent-orange-500"
                    style={{ accentColor: '#f97316' }}
                  />
                  <div className="flex justify-between text-[9px] text-zinc-600 font-bold px-1">
                    <span>5分</span><span>30分</span><span>1時</span><span>2時</span>
                  </div>
                </>
              )}

              {/* CUSTOM mode: display label input */}
              {mode === 'CUSTOM' && (
                <div className="pt-1">
                  <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                    卡片顯示名稱
                  </label>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="如：計程車、高鐵、接駁車"
                    className="w-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-800 bg-[#1c1c1e] flex gap-3 shrink-0">
          <button
            onClick={handleClear}
            disabled={loading || !itinerary.next_transport_mode}
            className="flex-1 py-4 bg-[#242426] hover:bg-red-500/10 text-zinc-400 hover:text-red-500 font-bold rounded-2xl transition-colors text-xs uppercase tracking-widest disabled:opacity-40"
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
