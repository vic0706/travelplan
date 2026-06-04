import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { apiFetch, safeJson } from '../utils/api';
import { format, isSameDay, isBefore, startOfDay } from 'date-fns';

interface WeatherWidgetProps {
  tripId: number;
  date: Date | null;
  // isFutureTrip: 未來行程預設展開，過去行程預設折疊
  isFutureTrip: boolean;
  // 外部 expand/collapse 信號（控制行程卡片，WeatherWidget 不跟）
  expandSignal?: number;
  collapseSignal?: number;
  // forceExpanded: 用在 Modal 中時強制展開且不顯示自己的折疊按鈕，改顯示關閉按鈕
  forceExpanded?: boolean;
  onClose?: () => void;
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

export function getWeatherIcon(code: number | null, size = 24, className?: string) {
  if (code === null) return <Cloud size={size} className={className ?? 'text-zinc-500'} />;
  if (code <= 3)  return <Sun           size={size} className={className ?? 'text-yellow-400'} />;
  if (code <= 49) return <CloudFog      size={size} className={className ?? 'text-zinc-400'} />;
  if (code <= 59) return <CloudDrizzle  size={size} className={className ?? 'text-blue-300'} />;
  if (code <= 69) return <CloudRain     size={size} className={className ?? 'text-blue-500'} />;
  if (code <= 79) return <CloudSnow    size={size} className={className ?? 'text-white'} />;
  if (code <= 99) return <CloudLightning size={size} className={className ?? 'text-purple-400'} />;
  return <Cloud size={size} className={className ?? 'text-zinc-500'} />;
}

export function WeatherWidget({
  tripId,
  date,
  isFutureTrip,
  expandSignal = 0,
  collapseSignal = 0,
  forceExpanded = false,
  onClose,
}: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // 本地展開狀態：
  //   forceExpanded (Modal 模式) → 永遠展開
  //   未來行程 → 預設展開
  //   過去行程 → 預設折疊
  const [isExpanded, setIsExpanded] = useState(forceExpanded || isFutureTrip);

  useEffect(() => {
    if (!forceExpanded) setIsExpanded(isFutureTrip);
  }, [isFutureTrip, forceExpanded]);

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

  useEffect(() => { fetchWeather(); }, [tripId, date]);

  const isPastDate = date ? isBefore(startOfDay(date), startOfDay(new Date())) : false;

  // ─── forceExpanded 模式（用於 Modal）：只顯示關閉按鈕，不顯示自己的折疊按鈕 ───
  if (forceExpanded) {
    return (
      <div className="flex flex-col gap-4">
        {/* Modal 標頭：Weather Forecast + X 關閉按鈕 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data?.summary && getWeatherIcon(data.summary.weather_code, 24)}
            <div>
              <h3 className="text-white font-bold text-base">Weather Forecast</h3>
              {data?.summary && (
                <p className="text-xs text-zinc-400">
                  H: {data.summary.max_temp}° &nbsp; L: {data.summary.min_temp}°
                </p>
              )}
              {date && (
                <p className="text-[10px] text-zinc-500 mt-0.5">{format(date, 'EEEE, MMM d')}</p>
              )}
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* 內容 */}
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        ) : message || !data || data.intervals.length === 0 ? (
          <div className="flex items-center justify-center h-16">
            <p className="text-sm text-zinc-500 italic">{message || 'No weather data available'}</p>
          </div>
        ) : (
          <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar border-t border-zinc-800 pt-4">
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
                <div key={idx}
                  className="flex-none w-[calc(25%-6px)] flex flex-col items-center bg-zinc-900 rounded-2xl py-3 px-1 border border-zinc-800">
                  <span className="text-[10px] font-medium text-zinc-500 mb-2">{interval.time}</span>
                  {getWeatherIcon(interval.code, 22)}
                  <span className="text-sm font-semibold text-white mt-2">
                    {interval.temp !== null ? `${interval.temp}°` : '--'}
                  </span>
                  <span className="text-[9px] font-medium text-orange-500/80 mt-1 truncate w-full text-center px-1">
                    {interval.city}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  // ─── 一般模式（內嵌在行程列表中） ────────────────────────────────────

  // 折疊狀態：顯示 Expand 按鈕
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

  // 展開 + loading
  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg">
        <button type="button" onClick={() => setIsExpanded(false)}
          className="w-full px-5 pt-4 pb-3 flex items-center justify-between text-zinc-400 hover:text-white transition-colors">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <Loader2 size={14} className="animate-spin text-orange-500" />
            Weather Forecast
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500">
            <span>Collapse</span><ChevronUp size={14} />
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
        <button type="button" onClick={() => setIsExpanded(false)}
          className="w-full px-5 pt-4 pb-3 flex items-center justify-between text-zinc-400 hover:text-white transition-colors">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <Cloud size={14} />Weather Forecast
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500">
            <span>Collapse</span><ChevronUp size={14} />
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
      {/* 折疊按鈕 */}
      <button type="button" onClick={() => setIsExpanded(false)}
        className="w-full px-5 pt-4 pb-3 flex items-center justify-between text-zinc-400 hover:text-white transition-colors">
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
          <span>Collapse</span><ChevronUp size={14} />
        </div>
      </button>

      {/* 逐時天氣 */}
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
            <div key={idx}
              className="flex-none w-[calc(25%-6px)] flex flex-col items-center bg-zinc-950/50 rounded-2xl py-3 px-1 border border-zinc-800/50">
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