import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Loader2 } from 'lucide-react';
import { apiFetch, safeJson } from '../utils/api';
import { format, isSameDay, isBefore, startOfDay } from 'date-fns';

interface WeatherWidgetProps {
  tripId: number;
  date: Date | null;
  // ✅ 新增：由父層 TripDetails 的 expand/collapse 按鈕控制是否展開
  isExpanded: boolean;
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

// ✅ 新增：將天氣 icon 邏輯 export 供 TripDetails 日期列使用
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

export function WeatherWidget({ tripId, date, isExpanded }: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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

  // ✅ 完全由 isExpanded 控制顯示：collapse 時整個 widget 隱藏
  if (!isExpanded) return null;

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center justify-center shadow-lg h-[80px]">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (message || !data || data.intervals.length === 0) {
    if (isPastDate) return null;
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col items-center justify-center shadow-lg min-h-[80px]">
        <p className="text-sm text-zinc-500 italic">{message || 'No weather data available'}</p>
      </div>
    );
  }

  return (
    // ✅ 移除自身的 onClick toggle，改為純展示元件
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg">
      {/* 摘要列：圖示 + 標題 + 最高/最低溫 */}
      <div className="flex items-center gap-3 mb-4">
        {data.summary && getWeatherIcon(data.summary.weather_code, 28)}
        <div>
          <h4 className="text-white font-semibold text-sm">Weather Forecast</h4>
          {data.summary && (
            <p className="text-xs text-zinc-400">
              H: {data.summary.max_temp}° &nbsp; L: {data.summary.min_temp}°
            </p>
          )}
        </div>
      </div>

      {/* 逐時天氣列 */}
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