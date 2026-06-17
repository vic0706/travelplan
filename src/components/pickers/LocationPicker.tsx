import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, MapPin, Loader2, Globe, ChevronRight, ArrowLeft, Plus, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../../utils/api';
import { db } from '../../db';

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (location: any) => void;
  groupedCities: Record<string, any[]>;
}

export function LocationPicker({ isOpen, onClose, onSelect, groupedCities }: LocationPickerProps) {
  const [searchQuery, setSearchQuery]     = useState('');
  const [isSearching, setIsSearching]     = useState(false);
  const [predictions, setPredictions]     = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [knownPlaceIds, setKnownPlaceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    db.itineraries.toArray().then(items => {
      const ids = new Set(items.map(i => i.google_place_id).filter(Boolean) as string[]);
      setKnownPlaceIds(ids);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) { setSearchQuery(''); setSelectedCountry(null); setPredictions([]); }
  }, [isOpen]);

  const localMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const allCities = Object.values(groupedCities).flat();
    return allCities.filter(city =>
      city.name.toLowerCase().includes(query) ||
      (city.country && city.country.toLowerCase().includes(query))
    ).slice(0, 3);
  }, [searchQuery, groupedCities]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) { setPredictions([]); return; }
      setIsSearching(true);
      try {
        const res = await apiFetch(`/api/places/autocomplete?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setPredictions(Array.isArray(data) ? data : []);
        } else {
          setPredictions([]);
        }
      } catch {
        setPredictions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
        photo_reference: details.photos?.[0]?.name,
      });
      onClose();
    } catch {
      /* silent */
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 38 }}
            className="relative w-full max-w-lg bg-zinc-950 border-t sm:border border-zinc-800/80 rounded-t-[32px] sm:rounded-[32px] overflow-hidden flex flex-col max-h-[88vh]"
          >
            {/* ── 標頭 ── */}
            <div className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-800/60 px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-black text-white uppercase tracking-widest">搜尋地點</span>
                <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-zinc-500 hover:text-white transition-colors active:scale-90">
                  <X size={18} />
                </button>
              </div>

              {/* 搜尋框 */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="景點、餐廳、飯店或城市..."
                  className="w-full bg-zinc-900 border border-zinc-800 text-white text-[14px] pl-10 pr-10 py-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/60 transition-all placeholder:text-zinc-600"
                />
                {isSearching
                  ? <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-orange-500 animate-spin" />
                  : searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors">
                      <X size={15} />
                    </button>
                  )
                }
              </div>
            </div>

            {/* ── 內容 ── */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-3">
              {searchQuery.trim() ? (
                <div className="space-y-4">

                  {/* 本地城市 */}
                  {localMatches.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-1 mb-2">
                        <Globe size={10} className="text-zinc-500" />
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">本地城市</span>
                      </div>
                      <div className="space-y-1.5">
                        {localMatches.map(city => (
                          <button
                            type="button"
                            key={city.id}
                            onClick={() => { onSelect(city); onClose(); }}
                            className="w-full flex items-center gap-3 px-3.5 py-3 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl hover:border-orange-500/40 hover:bg-zinc-900 transition-all active:scale-[0.99] text-left"
                          >
                            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                              <Globe size={15} className="text-orange-500" />
                            </div>
                            <div>
                              <div className="text-[13px] font-bold text-white">{city.name}</div>
                              <div className="text-[11px] text-zinc-500">{city.country}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Google 地圖搜尋 */}
                  <div>
                    <div className="flex items-center gap-1.5 px-1 mb-2">
                      <Sparkles size={10} className="text-orange-500" />
                      <span className="text-[9px] font-black text-orange-500/80 uppercase tracking-[0.18em]">Google 地圖搜尋</span>
                    </div>
                    {predictions.length > 0 ? (
                      <div className="space-y-1.5">
                        {predictions.map((p) => (
                          <button
                            type="button"
                            key={p.place_id}
                            onClick={() => handlePlaceSelect(p)}
                            className="w-full flex items-center gap-3 px-3.5 py-3 bg-zinc-900/40 border border-zinc-800/50 rounded-2xl hover:bg-zinc-900 hover:border-zinc-700 transition-all active:scale-[0.99] text-left"
                          >
                            <div className="w-8 h-8 rounded-xl bg-zinc-800/80 flex items-center justify-center shrink-0">
                              <MapPin size={15} className="text-zinc-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[13px] font-semibold text-white truncate">{p.structured_formatting.main_text}</span>
                                {knownPlaceIds.has(p.place_id) && (
                                  <span className="shrink-0 inline-flex items-center gap-0.5 bg-orange-500/10 text-orange-400 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-orange-500/20">
                                    <Zap size={7} strokeWidth={3} />已知
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 truncate">{p.structured_formatting.secondary_text}</div>
                            </div>
                            {knownPlaceIds.has(p.place_id)
                              ? <Zap size={14} className="shrink-0 text-orange-400" />
                              : <Plus size={15} className="shrink-0 text-zinc-700" />
                            }
                          </button>
                        ))}
                      </div>
                    ) : (
                      !isSearching && (
                        <div className="py-8 text-center">
                          <MapPin size={24} className="text-zinc-700 mx-auto mb-2" />
                          <p className="text-[12px] text-zinc-600">找不到相關地點</p>
                          <p className="text-[10px] text-zinc-700 mt-1">請嘗試更精確的名稱</p>
                        </div>
                      )
                    )}
                  </div>
                </div>

              ) : !selectedCountry ? (

                /* ── 瀏覽國家 ── */
                <div>
                  <div className="flex items-center gap-1.5 px-1 mb-2">
                    <Globe size={10} className="text-zinc-500" />
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">瀏覽國家</span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.keys(groupedCities).sort().map(country => (
                      <button
                        type="button"
                        key={country}
                        onClick={() => setSelectedCountry(country)}
                        className="w-full flex items-center justify-between px-3.5 py-3 bg-zinc-900/50 border border-zinc-800/60 rounded-2xl hover:border-zinc-700 transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <Globe size={15} className="text-zinc-500" />
                          <span className="text-[13px] font-semibold text-white">{country}</span>
                        </div>
                        <ChevronRight size={15} className="text-zinc-700" />
                      </button>
                    ))}
                  </div>
                </div>

              ) : (

                /* ── 城市列表 ── */
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedCountry(null)}
                    className="flex items-center gap-1.5 px-1 mb-3 text-orange-500 text-[11px] font-black tracking-wide"
                  >
                    <ArrowLeft size={13} strokeWidth={3} />返回
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    {groupedCities[selectedCountry].map(city => (
                      <button
                        type="button"
                        key={city.id}
                        onClick={() => { onSelect(city); onClose(); }}
                        className="p-3.5 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl text-left hover:border-orange-500/40 hover:bg-zinc-900 transition-all active:scale-[0.99]"
                      >
                        <MapPin size={14} className="text-zinc-600 mb-1.5" />
                        <div className="text-[13px] font-semibold text-white truncate">{city.name}</div>
                      </button>
                    ))}
                  </div>
                </div>

              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
