import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, MapPin, Loader2, Globe, ChevronRight, ArrowLeft, Plus, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../../utils/api';
import { useAppStore } from '../../store';

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (location: any) => void;
  groupedCities: Record<string, any[]>;
}

export function LocationPicker({ isOpen, onClose, onSelect, groupedCities }: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // 1. 本地城市篩選
  const localMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || query.length < 1) return [];
    const allCities = Object.values(groupedCities).flat();
    return allCities.filter(city =>
      city.name.toLowerCase().includes(query) ||
      (city.country && city.country.toLowerCase().includes(query))
    ).slice(0, 3);
  }, [searchQuery, groupedCities]);

  // 2. Google Places Autocomplete
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setPredictions([]);
        return;
      }

      setIsSearching(true);
      try {
        const res = await apiFetch(`/api/places/autocomplete?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setPredictions(Array.isArray(data) ? data : []);
        } else {
          setPredictions([]);
        }
      } catch (e) {
        console.error('Google Search Failed', e);
        setPredictions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 3. 選中 Google 地點後即時抓取座標
  const handlePlaceSelect = async (prediction: any) => {
    setIsSearching(true);
    try {
      const res = await apiFetch(`/api/places/details?placeId=${prediction.place_id}`);
      if (!res.ok) throw new Error('Failed to fetch place details');
      const details = await res.json();

      onSelect({
        name: prediction.structured_formatting.main_text,
        address: prediction.structured_formatting.secondary_text,
        google_place_id: prediction.place_id,
        lat: details.location?.latitude,
        lng: details.location?.longitude,
        photo_reference: details.photos?.[0]?.name
      });
      onClose();
    } catch (e) {
      console.error('Get Details Failed', e);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative w-full max-w-lg bg-zinc-950 border-t sm:border border-zinc-800 rounded-t-[32px] sm:rounded-[32px] overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header & Search */}
            <div className="p-6 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-white tracking-tight">SEARCH LOCATION</h2>
                {/* ✅ 修正：加上 type="button" 防止觸發 form submit */}
                <button type="button" onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full text-zinc-400 transition-colors"><X size={20} /></button>
              </div>

              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-orange-500 transition-colors" size={20} />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋景點、餐廳、飯店或城市..."
                  className="w-full bg-zinc-900 border border-zinc-800 text-white pl-12 pr-4 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all text-lg font-medium"
                />
                {isSearching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-500 animate-spin" size={20} />}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              
              {searchQuery ? (
                <div className="space-y-6">
                  {/* 本地城市匹配 */}
                  {localMatches.length > 0 && (
                    <div className="space-y-2">
                      <div className="px-2 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Globe size={12} /> Local Cities
                      </div>
                      {localMatches.map(city => (
                        // ✅ 修正：加上 type="button"
                        <button type="button" key={city.id} onClick={() => { onSelect(city); onClose(); }} className="w-full p-4 bg-zinc-900/50 border border-zinc-900 rounded-2xl flex items-center gap-4 hover:border-orange-500 transition-all group">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500"><Globe size={20} /></div>
                          <div className="text-left">
                            <div className="text-white font-bold">{city.name}</div>
                            <div className="text-zinc-500 text-xs">{city.country}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Google Places 建議 */}
                  <div className="space-y-2">
                    <div className="px-2 text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Sparkles size={12} /> Google Maps Places
                    </div>
                    {predictions.length > 0 ? (
                      predictions.map((p) => (
                        // ✅ 修正：加上 type="button"
                        <button type="button" key={p.place_id} onClick={() => handlePlaceSelect(p)} className="w-full p-4 bg-zinc-900/30 border border-zinc-900 rounded-2xl flex items-center gap-4 hover:bg-zinc-900 hover:border-zinc-700 transition-all group">
                          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-orange-500"><MapPin size={20} /></div>
                          <div className="text-left flex-1 min-w-0">
                            <div className="text-white font-bold truncate">{p.structured_formatting.main_text}</div>
                            <div className="text-zinc-500 text-xs truncate">{p.structured_formatting.secondary_text}</div>
                          </div>
                          <Plus size={18} className="text-zinc-700 group-hover:text-orange-500" />
                        </button>
                      ))
                    ) : (
                      !isSearching && <div className="p-8 text-center text-zinc-600 text-sm">找不到相關地點，請嘗試更精確的名稱</div>
                    )}
                  </div>
                </div>
              ) : (
                /* 按國家/城市瀏覽 */
                !selectedCountry ? (
                  <div className="space-y-4">
                    <div className="px-2 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Browse Countries</div>
                    <div className="grid grid-cols-1 gap-2">
                      {Object.keys(groupedCities).sort().map(country => (
                        // ✅ 修正：加上 type="button"
                        <button type="button" key={country} onClick={() => setSelectedCountry(country)} className="w-full p-4 bg-zinc-900/50 border border-zinc-900 rounded-2xl flex items-center justify-between hover:border-zinc-700 transition-all group">
                          <div className="flex items-center gap-3">
                            <Globe size={18} className="text-zinc-500 group-hover:text-orange-500" />
                            <span className="text-white font-bold text-sm">{country}</span>
                          </div>
                          <ChevronRight size={18} className="text-zinc-700" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* ✅ 修正：加上 type="button" */}
                    <button type="button" onClick={() => setSelectedCountry(null)} className="flex items-center gap-2 text-orange-500 text-xs font-black px-1 uppercase tracking-widest"><ArrowLeft size={14} /> Back to Countries</button>
                    <div className="grid grid-cols-2 gap-3">
                      {groupedCities[selectedCountry].map(city => (
                        // ✅ 修正：加上 type="button"
                        <button type="button" key={city.id} onClick={() => { onSelect(city); onClose(); }} className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-left hover:border-orange-500 transition-all group">
                          <MapPin size={16} className="text-zinc-600 group-hover:text-orange-500 mb-2 transition-colors" />
                          <div className="text-white font-bold text-sm truncate">{city.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}