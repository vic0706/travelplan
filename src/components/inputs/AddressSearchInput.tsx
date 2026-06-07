import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { getCachedPlaceSuggestions, cachePlaceSuggestions, getCachedPlaceDetails, cachePlaceDetails } from '../../db';
import { clsx } from 'clsx';

export interface PlaceResult {
  address: string;
  lat?: number;
  lng?: number;
  google_place_id?: string;
  name?: string;
  image_url?: string;
}

interface AddressSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceResult) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function AddressSearchInput({ value, onChange, onPlaceSelect, placeholder = '搜尋地址...', label, className }: AddressSearchInputProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const sessionToken = useRef(Math.random().toString(36).substring(2));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!isEditing || value.length < 2) { setSuggestions([]); return; }
      setIsSearching(true);
      try {
        const cached = await getCachedPlaceSuggestions(value);
        if (cached) { setSuggestions(cached); setIsSearching(false); return; }
        const res = await apiFetch(`/api/places/autocomplete?q=${encodeURIComponent(value)}&session=${sessionToken.current}`);
        if (res.ok) {
          const data = await res.json() as any[];
          const results = Array.isArray(data) ? data : [];
          setSuggestions(results);
          await cachePlaceSuggestions(value, results);
        }
      } catch { setSuggestions([]); }
      finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [value, isEditing]);

  const handleSelect = async (suggestion: any) => {
    onChange(suggestion.description);
    setSuggestions([]);
    setIsEditing(false);
    if (!onPlaceSelect) return;

    try {
      let details: any = await getCachedPlaceDetails(suggestion.place_id);
      if (!details) {
        const res = await apiFetch(`/api/places/details?placeId=${suggestion.place_id}&session=${sessionToken.current}`);
        if (res.ok) {
          details = await res.json();
          await cachePlaceDetails(suggestion.place_id, details);
        }
      }
      sessionToken.current = Math.random().toString(36).substring(2);

      onPlaceSelect({
        address: details?.formattedAddress || suggestion.description,
        lat: details?.location?.latitude,
        lng: details?.location?.longitude,
        google_place_id: suggestion.place_id,
        name: details?.displayName?.text,
        image_url: details?.actual_photo_url || undefined,
      });
    } catch {
      onPlaceSelect({ address: suggestion.description, google_place_id: suggestion.place_id });
    }
  };

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {label && (
        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">{label}</label>
      )}
      <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 gap-2 focus-within:border-orange-500 transition-colors">
        {isSearching
          ? <Loader2 size={14} className="text-orange-500 shrink-0 animate-spin" />
          : <MapPin size={14} className="text-orange-500 shrink-0" />
        }
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setIsEditing(true); }}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-600"
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl max-h-56 overflow-y-auto">
          {suggestions.slice(0, 5).map(s => (
            <button
              key={s.place_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              className="w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800/60 last:border-0"
            >
              <p className="text-sm text-white font-medium truncate">
                {s.structured_formatting?.main_text || s.description}
              </p>
              {s.structured_formatting?.secondary_text && (
                <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                  {s.structured_formatting.secondary_text}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
