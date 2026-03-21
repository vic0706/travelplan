import React, { useState, useMemo } from 'react';
import { X, Search, MapPin, Loader2, Globe, ChevronRight, ArrowLeft, Database, Plus } from 'lucide-react';
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
  const [isSaving, setIsSaving] = useState(false);
  const { setCities } = useAppStore();
  
  // 💡 用來控制「先選國家、再選城市」的狀態
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // 1. 本地篩選邏輯 (解決搜尋不到台北的問題)
  const localMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const allCities = Object.values(groupedCities).flat();
    return allCities.filter(city => 
      city.name.toLowerCase().includes(query) || 
      (city.country && city.country.toLowerCase().includes(query))
    );
  }, [searchQuery, groupedCities]);

  // 2. 🚀 直接發動後端搜尋與存檔
  const handleServerSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSaving(true);
    try {
      // 💡 這裡會發動 /api/cities/search，由後端去抓經緯度並存入 DB
      const res = await apiFetch('/api/cities/search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery })
      });

      if (res.ok) {
        const data = await res.json();
        
        // 重新抓取資料庫城市清單，讓前端同步
        const refreshRes = await apiFetch('/api/cities');
        if (refreshRes.ok) setCities(await refreshRes.json());

        onSelect({ id: data.id, name: data.name });
        onClose();
      } else {
        const error = await res.json();
        alert(error.error || "Search failed");
      }
    } catch (error) {
      alert("Network error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
          <motion.div 
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} 
            className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[85vh]"
          >
            {/* 💡 Header: LOCATION 改成 CITY */}
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white uppercase tracking-widest">Select City</h3>
                <button type="button" onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"><X size={20} /></button>
              </div>
              <div className="relative">
                <Search size={18} className="absolute left-4 top-3.5 text-zinc-500" />
                <input 
                  type="text" autoFocus placeholder="Search city or landmark..." value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedCountry) setSelectedCountry(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleServerSearch())}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3.5 text-white focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
              {isSaving ? (
                <div className="flex flex-col items-center justify-center h-full gap-5">
                   <Loader2 className="animate-spin text-orange-500" size={40} />
                   <p className="text-white font-black uppercase tracking-widest">Syncing with DB...</p>
                </div>
              ) : searchQuery.trim() !== '' ? (
                <div className="space-y-6">
                  {/* 情境 A: 搜尋模式 */}
                  {localMatches.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-widest px-1 flex items-center gap-2">
                        <Database size={12} /> Matches in DB
                      </h4>
                      {localMatches.map(city => (
                        <button type="button" key={city.id} onClick={() => { onSelect(city); onClose(); }} className="w-full text-left bg-zinc-900 border border-zinc-800 p-4 rounded-2xl hover:border-orange-500 transition-all flex items-center gap-4">
                          <MapPin size={18} className="text-zinc-500" />
                          <div>
                            <div className="text-white font-bold text-base">{city.name}</div>
                            <div className="text-zinc-500 text-xs">{city.country}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Add New City</h4>
                    <button 
                      type="button"
                      onClick={handleServerSearch}
                      className="w-full flex items-center justify-between p-6 bg-orange-500 text-white rounded-[24px] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center"><Plus size={24} /></div>
                        <div className="text-left">
                          <span className="text-white font-black text-sm block">Confirm & Add "{searchQuery}"</span>
                          <span className="text-white/70 text-[10px] uppercase font-bold tracking-widest">Fetch GPS via API</span>
                        </div>
                      </div>
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              ) : (
                /* 💡 情境 B: 恢復原本的先選國家、再選城市介面 */
                !selectedCountry ? (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Select Country</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {Object.keys(groupedCities).sort().map(country => (
                        <button type="button" key={country} onClick={() => setSelectedCountry(country)} className="w-full flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl hover:bg-zinc-800 transition-all group">
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
                    <button type="button" onClick={() => setSelectedCountry(null)} className="flex items-center gap-2 text-orange-500 text-xs font-black px-1 uppercase tracking-widest"><ArrowLeft size={14} /> Back to Countries</button>
                    <div className="grid grid-cols-2 gap-3">
                      {groupedCities[selectedCountry].map(city => (
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