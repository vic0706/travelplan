import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ArrowLeft, MapPin, Search, Loader2, Globe } from 'lucide-react';
import { apiFetch, safeJson } from '../utils/api';
import { City } from '../types';

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  // 💡 升級：回傳更完整的物件，而不只是單純的 ID
  onSelect: (result: { 
    id?: number;           // 原本的城市 ID (若從瀏覽模式選擇)
    name: string;          // 地點名稱
    address?: string;      // 完整地址
    lat?: number;          // 緯度
    lng?: number;          // 經度
    google_place_id?: string // 智慧同步的核心密鑰 
  }) => void;
  groupedCities: Record<string, City[]>;
}

export function LocationPicker({ isOpen, onClose, onSelect, groupedCities }: LocationPickerProps) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<any>(null);

  // 當視窗關閉時重置內部狀態
  useEffect(() => {
    if (!isOpen) {
      setSelectedCountry(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen]);

  // 💡 智慧搜尋邏輯 (對接後端 Google Places Proxy)
  const handleSearch = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // 這邊預設會打之後要在 Worker 新增的搜尋 API
      const res = await apiFetch(`/api/places/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await safeJson<any[]>(res);
        setSearchResults(data || []);
      }
    } catch (err) {
      console.error('Place search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounce 處理，避免輸入一個字就打一次 API，節省流量 (省流優先)
  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.length > 1) {
      searchTimeout.current = setTimeout(() => {
        handleSearch(val);
      }, 500);
    }
  };

  if (!isOpen) return null;

  const countries = Object.keys(groupedCities).sort();

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh]"
        >
          {/* Header & Search Bar */}
          <div className="p-4 border-b border-zinc-800 bg-zinc-900 shrink-0 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedCountry && !searchQuery && (
                  <button onClick={() => setSelectedCountry(null)} className="p-1 -ml-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                )}
                <h3 className="text-lg font-bold text-white">
                  {searchQuery ? 'Search Results' : selectedCountry ? selectedCountry : 'Select Location'}
                </h3>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* 🔍 地點搜尋框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={onSearchChange}
                placeholder="Search places or attractions..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="animate-spin text-orange-500" size={18} />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {/* 模式一：搜尋結果列表 */}
            {searchQuery ? (
              <div className="space-y-1">
                {searchResults.length > 0 ? (
                  searchResults.map((place) => (
                    <button
                      key={place.google_place_id}
                      onClick={() => {
                        onSelect({
                          name: place.name,
                          address: place.address,
                          lat: place.lat,
                          lng: place.lng,
                          google_place_id: place.google_place_id
                        });
                        onClose();
                      }}
                      className="w-full flex items-start gap-3 p-4 hover:bg-zinc-800 rounded-xl transition-colors text-left"
                    >
                      <MapPin size={18} className="text-orange-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-zinc-100 block">{place.name}</span>
                        <span className="text-xs text-zinc-500 line-clamp-1">{place.address}</span>
                      </div>
                    </button>
                  ))
                ) : !isSearching && searchQuery.length > 1 && (
                  <div className="text-center py-10 text-zinc-500">
                    <p className="text-sm">No matching places found.</p>
                  </div>
                )}
              </div>
            ) : (
              /* 模式二：原本的城市瀏覽模式 [cite: 866-871] */
              !selectedCountry ? (
                <div className="space-y-1">
                  {countries.map(country => (
                    <button
                      key={country}
                      onClick={() => setSelectedCountry(country)}
                      className="w-full flex items-center justify-between p-4 hover:bg-zinc-800 rounded-xl transition-colors group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <Globe size={18} className="text-zinc-500" />
                        <span className="font-medium text-zinc-200 group-hover:text-white">{country}</span>
                      </div>
                      <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {groupedCities[selectedCountry]?.map(city => (
                    <button
                      key={city.id}
                      onClick={() => {
                        onSelect({ id: Number(city.id), name: city.name });
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800 rounded-xl transition-colors group text-left"
                    >
                      <MapPin size={18} className="text-zinc-500 group-hover:text-orange-500" />
                      <span className="font-medium text-zinc-200 group-hover:text-white">{city.name}</span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}