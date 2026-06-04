import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch, safeJson } from '../utils/api';
import { format, isSameDay, isBefore, startOfDay } from 'date-fns';

interface WeatherWidgetProps {
  tripId: number;
  date: Date | null;
  // isFutureTrip: 未來行程預設展開，過去行程預設折疊
  isFutureTrip: boolean;
  // 外部的 expand / collapse 信號（由日期列的展開/折疊全部按鈕送來）
  expandSignal?: number;
  collapseSignal?: number;
}

interface WeatherData {
  date: string;
  summary: {
    max_temp: number;
    min_temp: number;
    weather_code: number;
  } | null;
  intervals: {
    time: string;
    city: string;
    temp: number | null;
    pop: number | null;
    code: number | null;
  }[];
}

// ✅ export 供 TripDetails 日期列使用
export function getWeatherIcon(code: number | null, size = 24, className?: string) {
  if (code === null) return <Cloud size={size} className={className ?? 'text-zinc-500'} />;
  if (code <= 3)  return <Sun          size={size} className={className ?? 'text-yellow-400'} />;
  if (code <= 49) return <CloudFog     size={size} className={className ?? 'text-zinc-400'} />;
  if (code <= 59) return <CloudDrizzle size={size} className={className ?? 'text-blue-300'} />;
  if (code <= 69) return <CloudRain    size={size} className={className ?? 'text-blue-500'} />;
  if (code <= 79) return <CloudSnow   size={size} className={className ?? 'text-white'} />;
  if (code <= 99) return <CloudLightning size={size} className={className ?? 'text-purple-400'} />;
  return <Cloud size={size} className={className ?? 'text-zinc-500'} />;
}

export function WeatherWidget({
  tripId,
  date,
  isFutureTrip,
  expandSignal = 0,
  collapseSignal = 0,
}: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // Weather widget 本身的折疊狀態：
  //   - 未來行程 → 預設展開
  //   - 過去行程 → 預設折疊
  // 不論如何，用戶都可以手動切換（Weather forecast 自己的按鈕不受外部全展開/折疊控制）
  const [isExpanded, setIsExpanded] = useState(isFutureTrip);

  // 當 isFutureTrip 因切換日期等改變時，重設預設狀態
  useEffect(() => {
    setIsExpanded(isFutureTrip);
  }, [isFutureTrip]);

  // 注意：WeatherWidget 不監聽 expandSignal / collapseSignal，
  // 因為需求是「weather forecast 自己的按鈕都是預設摺疊，除非用戶手動觸發」
  // 外部的 expand/collapse 只控制行程卡片，不控制天氣小工具。
  // (如果需要日後也要讓 weather 跟著 expand/collapse，可以在這裡加 useEffect)

  const fetchWeather = async () => {
    if (!date) return;
    setLoading(true);
    setData(null);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await apiFetch(`/api/trips/${tripId}/weather?date=${dateStr}`);
      if (res.status === 202 || res.status === 404) {
        const json = await safeJson<{ message: string }>(res, { message: 'Weather not available' });
        setMessage(json.message);
        setData(null);
      } else if (res.ok) {
        const json = await safeJson<WeatherData>(res, null);
        setData(json);
        setMessage(null);
      }
    } catch (err) {
      console.error('Failed to fetch weather', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
  }, [tripId, date]);

  const isPastDate = date ? isBefore(startOfDay(date), startOfDay(new Date())) : false;

  // 折疊時顯示一個精簡的 header bar，用戶可點擊展開
  const headerLabel = isFutureTrip ? 'Collapse' : 'Expand';

  // ── 折疊狀態：顯示精簡 header 讓用戶可展開 ─────────────────────────
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 flex items-center justify-between text-zinc-500 hover:text-white hover:border-zinc-600 transition-all"
      >
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
          <Cloud size={14} />
          Weather Forecast
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500">
          <span>Expand</span>
          <ChevronDown size={14} />
        </div>
      </button>
    );
  }

  // ── 展開狀態 ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg">
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="w-full px-5 pt-4 pb-3 flex items-center justify-between text-zinc-400 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <Loader2 size={14} className="animate-spin text-orange-500" />
            Weather Forecast
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500">
            <span>Collapse</span>
            <ChevronUp size={14} />
          </div>
        </button>
        <div className="p-5 pt-2 flex items-center justify-center h-16">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (message || !data || data.intervals.length === 0) {
    if (isPastDate) return null;
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg">
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="w-full px-5 pt-4 pb-3 flex items-center justify-between text-zinc-400 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <Cloud size={14} />
            Weather Forecast
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500">
            <span>Collapse</span>
            <ChevronUp size={14} />
          </div>
        </button>
        <div className="px-5 pb-5 flex flex-col items-center justify-center min-h-[60px]">
          <p className="text-sm text-zinc-500 italic">{message || 'No weather data available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg">
      {/* 折疊按鈕 header */}
      <button
        type="button"
        onClick={() => setIsExpanded(false)}
        className="w-full px-5 pt-4 pb-3 flex items-center justify-between text-zinc-400 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-3">
          {data.summary && getWeatherIcon(data.summary.weather_code, 18)}
          <div className="text-left">
            <div className="text-xs font-bold uppercase tracking-widest text-white">Weather Forecast</div>
            {data.summary && (
              <div className="text-[10px] text-zinc-400">
                H: {data.summary.max_temp}° &nbsp; L: {data.summary.min_temp}°
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500">
          <span>Collapse</span>
          <ChevronUp size={14} />
        </div>
      </button>

      {/* 逐時天氣列 */}
      <div className="flex overflow-x-auto gap-2 px-5 pb-5 pt-1 no-scrollbar border-t border-zinc-800">
        {data.intervals
          .filter(interval => {
            const now = new Date();
            const isToday = date ? isSameDay(date, now) : false;
            if (!isToday) return true;
            if (interval.time.includes('(+1)')) return true;
            const intervalHour = parseInt(interval.time.split(':')[0], 10);
            return intervalHour + 3 > now.getHours();
          })
          .map((interval, idx) => (
            <div
              key={idx}
              className="flex-none w-[calc(25%-6px)] flex flex-col items-center bg-zinc-950/50 rounded-2xl py-3 px-1 border border-zinc-800/50"
            >
              <span className="text-[10px] font-medium text-zinc-500 mb-2">{interval.time}</span>
              {getWeatherIcon(interval.code, 20)}
              <span className="text-sm font-semibold text-white mt-2">
                {interval.temp !== null ? `${interval.temp}°` : '--'}
              </span>
              <span className="text-[9px] font-medium text-orange-500/80 mt-1 truncate w-full text-center px-1">
                {interval.city}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}