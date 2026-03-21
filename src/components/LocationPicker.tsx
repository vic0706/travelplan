import React, { useState, useMemo } from 'react';
import { X, Search, MapPin, Loader2, Globe, ChevronRight, ArrowLeft, Database, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { useAppStore } from '../store';

export function LocationPicker({ isOpen, onClose, onSelect, groupedCities }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { setCities } = useAppStore();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // 本地篩選 (維持不變，解決搜尋不到台北的問題)
  const localMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const all = Object.values(groupedCities).flat();
    return all.filter((c: any) => c.name.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q));
  }, [searchQuery, groupedCities]);

  // 🚀 核心：直接發動後端搜尋，完全不依賴瀏覽器的 google 物件
  const handleServerSideSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSaving(true);
    try {
      // 💡 直接調用我們剛寫好的後端路由
      const res = await apiFetch('/api/cities/search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery })
      });

      if (res.ok) {
        const data = await res.json();
        
        // 重新整理全域城市清單
        const refreshRes = await apiFetch('/api/cities');
        if (refreshRes.ok) setCities(await refreshRes.json());

        onSelect({ id: data.id, name: data.name });
        onClose();
      } else {
        const err = await res.json();
        alert(err.error || "搜尋失敗");
      }
    } catch (error) {
      alert("網路連線錯誤");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] w-full max-w-md overflow-hidden flex flex-col h-[80vh]">
            
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white uppercase tracking-widest">Location</h3>
                <button type="button" onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="relative">
                <Search size={18} className="absolute left-4 top-3.5 text-zinc-500" />
                <input 
                  type="text" autoFocus placeholder="Enter city (e.g. Los Angeles)" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleServerSideSearch())}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3.5 text-white focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {isSaving ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Loader2 className="animate-spin text-orange-500" size={40} />
                  <p className="text-white font-bold uppercase tracking-widest">Searching & Saving...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 1. 本地匹配 */}
                  {localMatches.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-widest px-1">From Database</h4>
                      {localMatches.map((city: any) => (
                        <button type="button" key={city.id} onClick={() => { onSelect(city); onClose(); }} className="w-full text-left bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center gap-4">
                          <MapPin size={18} className="text-orange-500" />
                          <span className="text-white font-bold">{city.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 2. 強制搜尋按鈕 */}
                  {searchQuery.trim() && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">New Location</h4>
                      <button 
                        type="button" onClick={handleServerSideSearch}
                        className="w-full flex items-center justify-between p-6 bg-orange-500 text-white rounded-[24px] shadow-xl shadow-orange-500/20"
                      >
                        <div className="flex items-center gap-4">
                          <Globe size={24} />
                          <div className="text-left">
                            <span className="font-black text-sm block">Find & Add "{searchQuery}"</span>
                            <span className="text-white/70 text-[10px] uppercase font-bold tracking-widest">Via Worker API</span>
                          </div>
                        </div>
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}