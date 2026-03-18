import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { format, isSameDay } from 'date-fns';

interface WeatherWidgetProps {
  tripId: number;
  date: Date;
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

export function WeatherWidget({ tripId, date }: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchWeather = async () => {
    setLoading(true);
    setData(null); 
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await apiFetch(`/api/trips/${tripId}/weather?date=${dateStr}`);
      if (res.status === 202 || res.status === 404) {
        const json = await res.json() as { message: string };
        setMessage(json.message);
        setData(null);
      } else if (res.ok) {
        const json = await res.json() as WeatherData;
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

  // 💡 SYNC TRIP NOW 觸發全域同步
  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncing(true);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/sync`, { method: 'POST' });
      if (res.ok) {
        window.location.reload(); 
      }
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      setSyncing(false);
    }
  };

  const getWeatherIcon = (code: number | null, size = 24) => {
    if (code === null) return <Cloud size={size} className="text-zinc-500" />;
    if (code <= 3) return <Sun size={size} className="text-yellow-400" />;
    if (code <= 49) return <CloudFog size={size} className="text-zinc-400" />;
    if (code <= 59) return <CloudDrizzle size={size} className="text-blue-300" />;
    if (code <= 69) return <CloudRain size={size} className="text-blue-500" />;
    if (code <= 79) return <CloudSnow size={size} className="text-white" />;
    if (code <= 99) return <CloudLightning size={size} className="text-purple-400" />;
    return <Cloud size={size} className="text-zinc-500" />;
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center justify-center shadow-lg h-[80px]">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (message || !data || data.intervals.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col items-center justify-center shadow-lg min-h-[80px] gap-2">
        <div className="flex items-center justify-between w-full">
           <p className="text-sm text-zinc-400">{message || 'No weather data'}</p>
           <button 
              onClick={handleSync} disabled={syncing}
              className="text-[10px] font-bold text-orange-500 bg-orange-500/10 hover:bg-orange-500/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? 'SYNCING...' : 'SYNC TRIP NOW'}
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg transition-all duration-300">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {data.summary && getWeatherIcon(data.summary.weather_code, 32)}
          <div>
            <h4 className="text-white font-medium text-sm">Weather Forecast</h4>
            {data.summary && (
              <p className="text-xs text-zinc-400">
                H: {data.summary.max_temp}° L: {data.summary.min_temp}°
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSync} disabled={syncing}
            className="text-[10px] font-bold text-zinc-400 hover:text-orange-500 bg-zinc-800 hover:bg-orange-500/10 px-2 py-1 rounded-full transition-colors flex items-center gap-1 disabled:opacity-50 border border-zinc-700"
          >
            <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
            {syncing ? 'SYNCING...' : 'SYNC TRIP NOW'}
          </button>
          <div className="text-xs text-orange-500 font-medium">
            {isExpanded ? 'Collapse' : 'Expand'}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="flex overflow-x-auto gap-2 mt-4 pt-4 border-t border-zinc-800 pb-2 no-scrollbar">
          {data.intervals
            .filter(interval => {
              const now = new Date();
              const isToday = isSameDay(date, now);
              if (!isToday) return true;
              if (interval.time.includes('(+1)')) return true;
              const intervalHour = parseInt(interval.time.split(':')[0], 10);
              return intervalHour + 3 > now.getHours();
            })
            .map((interval, idx) => (
            <div key={idx} className="flex-none w-[calc(25%-6px)] flex flex-col items-center bg-zinc-950/50 rounded-2xl py-3 px-1 border border-zinc-800/50">
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
      )}
    </div>
  );
}