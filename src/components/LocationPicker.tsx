import React, { useState, useEffect } from 'react';
import { X, Search, MapPin, Loader2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { useAppStore } from '../store';

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (city: { id: number; name: string }) => void;
  groupedCities: Record<string, any[]>;
}

export function LocationPicker({ isOpen, onClose, onSelect, groupedCities }: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const { setCities } = useAppStore(); // 用來更新全域狀態

  // 💡 呼叫 Google Places API 進行搜尋
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const searchGooglePlaces = async () => {
      if (!window.google?.maps?.places) {
        console.warn("Google Maps script not loaded yet.");
        return;
      }

      setIsSearching(true);
      const service = new window.google.maps.places.AutocompleteService();
      
      service.getPlacePredictions(
        { 
          input: searchQuery, 
          types: ['(cities)'] // 限制只搜尋城市級別，避免搜到拉麵店
        }, 
        (predictions, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSearchResults(predictions);
          } else {
            setSearchResults([]);
          }
          setIsSearching(false);
        }
      );
    };

    const debounce = setTimeout(searchGooglePlaces, 500);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  // 💡 點擊新城市時：取得經緯度 -> 呼叫後端建立 -> 傳回 ID
  const handleSelectNewCity = async (placeId: string, description: string) => {
    if (!window.google?.maps) return;
    setIsSearching(true);

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId }, async (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        
        // 解析國家名稱與城市名稱
        let country = '';
        let cityName = description.split(',')[0]; 
        
        results[0].address_components.forEach(comp => {
          if (comp.types.includes('country')) country = comp.long_name;
          if (comp.types.includes('locality')) cityName = comp.long_name;
        });

        try {
          // 呼叫我們剛剛寫的 POST /api/cities 查找或建立
          const res = await apiFetch('/api/cities', {
            method: 'POST',
            body: JSON.stringify({
              name: cityName,
              country: country,
              lat,
              lng,
              google_place_id: placeId
            })
          });

          if (res.ok) {
            const data = await res.json();
            
            // 💡 順便重新抓取最新的全域城市清單，讓畫面立刻有新城市
            const refreshRes = await apiFetch('/api/cities');
            if (refreshRes.ok) setCities(await refreshRes.json());

            onSelect({ id: data.id, name: cityName });
            onClose();
          } else {
            alert('Failed to save new city to database.');
          }
        } catch (error) {
          console.error(error);
          alert('Error connecting to server.');
        } finally {
          setIsSearching(false);
        }
      } else {
        alert('Failed to get location details from Google.');
        setIsSearching(false);
      }
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
          <motion.div 
            initial={{ y: '100%' }} 
            animate={{ y: 0 }} 
            exit={{ y: '100%' }} 
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[85vh] sm:h-[70vh]"
          >
            {/* Header & Search */}
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-4 shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white uppercase tracking-widest">Select City</h3>
                <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="relative">
                <Search size={18} className="absolute left-4 top-3.5 text-zinc-500" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Search any city in the world..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3.5 text-white font-medium focus:outline-none focus:border-orange-500 transition-colors"
                />
                {isSearching && (
                  <div className="absolute right-4 top-3.5">
                    <Loader2 size={18} className="animate-spin text-orange-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-[#1c1c1e]">
              
              {/* 搜尋結果區塊 */}
              {searchQuery.trim() !== '' ? (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Globe size={14} /> Search Results
                  </h4>
                  {searchResults.length > 0 ? (
                    searchResults.map(place => (
                      <button
                        key={place.place_id}
                        onClick={() => handleSelectNewCity(place.place_id, place.description)}
                        disabled={isSearching}
                        className="w-full text-left bg-zinc-900 border border-zinc-800 p-4 rounded-2xl hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group flex items-center gap-4"
                      >
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-orange-500/20 group-hover:text-orange-500 transition-colors">
                          <MapPin size={18} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-white font-bold text-base">{place.structured_formatting.main_text}</span>
                          <span className="text-zinc-500 text-xs">{place.structured_formatting.secondary_text}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    !isSearching && <div className="text-center text-zinc-500 py-8 text-sm">No cities found.</div>
                  )}
                </div>
              ) : (
                /* 預設資料庫城市列表 (當沒有搜尋時顯示) */
                Object.entries(groupedCities).map(([country, cityList]) => (
                  <div key={country} className="space-y-3">
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-2 mb-3">
                      {country}
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {cityList.map(city => (
                        <button
                          key={city.id}
                          onClick={() => {
                            onSelect(city);
                            onClose();
                          }}
                          className="text-left bg-zinc-900/50 border border-zinc-800 p-3.5 rounded-2xl hover:bg-zinc-800 hover:border-zinc-600 transition-all flex items-center gap-3"
                        >
                          <MapPin size={14} className="text-zinc-600" />
                          <span className="text-white font-medium text-sm truncate">{city.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}