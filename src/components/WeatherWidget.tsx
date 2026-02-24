import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Loader2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface WeatherWidgetProps {
  tripId: number;
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

export function WeatherWidget({ tripId }: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await apiFetch(`/api/trips/${tripId}/weather`);
        if (res.status === 202) {
          const json = await res.json() as { message: string };
          setMessage(json.message);
        } else if (res.ok) {
          const json = await res.json() as WeatherData;
          setData(json);
        }
      } catch (err) {
        console.error('Failed to fetch weather', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [tripId]);

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
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center justify-center shadow-lg h-[104px]">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (message) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center justify-center shadow-lg h-[104px]">
        <p className="text-sm text-zinc-400">{message}</p>
      </div>
    );
  }

  if (!data || data.intervals.length === 0) {
    return null;
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-white font-medium">Today's Weather</h4>
          {data.summary && (
            <p className="text-xs text-zinc-400 mt-0.5">
              H: {data.summary.max_temp}° L: {data.summary.min_temp}°
            </p>
          )}
        </div>
        {data.summary && getWeatherIcon(data.summary.weather_code, 28)}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {data.intervals.map((interval, idx) => (
          <div key={idx} className="flex flex-col items-center bg-zinc-950/50 rounded-2xl py-3 px-1 border border-zinc-800/50">
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
