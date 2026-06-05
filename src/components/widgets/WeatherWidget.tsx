import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Loader2 } from 'lucide-react';
import { apiFetch, safeJson } from '../../utils/api';
import { format, isSameDay, isBefore, startOfDay } from 'date-fns';

interface WeatherWidgetProps {
  tripId: number;
  date: Date | null;
  isFutureTrip: boolean;
  expandSignal?: number;
  collapseSignal?: number;
  forceExpanded?: boolean;
  onClose?: () => void;
  controlled?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}

interface WeatherData {
  date: string;
  summary: { max_temp: number; min_temp: number; weather_code: number } | null;
  intervals: { time: string; city: string; temp: number | null; pop: number | null; code: number | null }[];
}

export function getWeatherIcon(code: number | null, size = 24, className?: string) {
  if (code === null) return <Cloud size={size} className={className ?? 'text-zinc-500'} />;
  if (code <= 3)  return <Sun            size={size} className={className ?? 'text-yellow-400'} />;
  if (code <= 49) return <CloudFog       size={size} className={className ?? 'text-zinc-400'} />;
  if (code <= 59) return <CloudDrizzle   size={size} className={className ?? 'text-blue-300'} />;
  if (code <= 69) return <CloudRain      size={size} className={className ?? 'text-blue-500'} />;
  if (code <= 79) return <CloudSnow      size={size} className={className ?? 'text-white'} />;
  if (code <= 99) return <CloudLightning size={size} className={className ?? 'text-purple-400'} />;
  return <Cloud size={size} className={className ?? 'text-zinc-500'} />;
}

export function WeatherWidget({
  tripId, date, isFutureTrip,
  forceExpanded = false, onClose,
  controlled = false, isExpanded: externalExpanded, onToggle,
}: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true); setData(null);
      try {
        const res = await apiFetch(`/api/trips/${tripId}/weather?date=${format(date, 'yyyy-MM-dd')}`);
        if (res.status === 202 || res.status === 404) {
          const json = await safeJson<{ message: string }>(res, { message: '天氣資料尚未取得' });
          if (!cancelled) { setMessage(json.message); setData(null); }
        } else if (res.ok) {
          const json = await safeJson<WeatherData>(res, null);
          if (!cancelled) { setData(json); setMessage(null); }
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [tripId, date]);

  const intervals = (data?.intervals ?? []).filter(interval => {
    const now = new Date();
    const isToday = date ? isSameDay(date, now) : false;
    if (!isToday) return true;
    if (interval.time.includes('(+1)')) return true;
    return parseInt(interval.time.split(':')[0], 10) + 3 > now.getHours();
  });

  // ── 受控模式（ItineraryTab 使用）：只在 isExpanded=true 時顯示 ──────
  if (controlled) {
    if (!externalExpanded) return null;
    return (
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* 簡潔標頭 */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          {data?.summary ? getWeatherIcon(data.summary.weather_code, 16) : <Cloud size={16} className="text-zinc-500" />}
          <span className="text-xs font-black text-white uppercase tracking-widest">天氣預報</span>
          {data?.summary && (
            <span className="text-[10px] text-zinc-400 ml-1">最高 {data.summary.max_temp}° · 最低 {data.summary.min_temp}°</span>
          )}
          {date && <span className="text-[9px] text-zinc-600 ml-auto">{format(date, 'M/d EEEE')}</span>}
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-16 border-t border-zinc-800">
            <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
          </div>
        ) : message || !data || intervals.length === 0 ? (
          <div className="flex items-center justify-center h-12 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 italic">{message || '尚無天氣資料'}</p>
          </div>
        ) : (
          <div className="flex overflow-x-auto gap-1.5 px-3 pb-3 pt-2 no-scrollbar border-t border-zinc-800">
            {intervals.map((interval, idx) => (
              <div key={idx} className="flex-none w-[calc(25%-4px)] flex flex-col items-center bg-zinc-950/60 rounded-xl py-2.5 px-1 border border-zinc-800/60">
                <span className="text-[9px] font-medium text-zinc-500 mb-1.5">{interval.time}</span>
                {getWeatherIcon(interval.code, 18)}
                <span className="text-xs font-semibold text-white mt-1.5">{interval.temp !== null ? `${interval.temp}°` : '--'}</span>
                <span className="text-[8px] text-orange-500/70 mt-0.5 truncate w-full text-center">{interval.city}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── forceExpanded 模式（保留備用）
  return null;
}
