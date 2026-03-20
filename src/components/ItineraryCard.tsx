import React, { useState, useEffect } from 'react';
import { Map, Car, Train, Bus, AlertTriangle, Star, Maximize2, Minimize2, Plus, Footprints, Bike, Navigation2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary } from '../types';
import { DynamicIcon } from './DynamicIcon';
import { useAppStore } from '../store';
import { clsx } from 'clsx';

interface ItineraryCardProps {
  item: Itinerary;
  canEdit?: boolean;
  isConflicted?: boolean;
  onEdit: () => void;
  showNextTransport?: boolean;
  onEditNextTransport?: () => void;
  expandSignal?: number;
  collapseSignal?: number;
  isDragOverlay?: boolean;
}

export function ItineraryCard({ 
  item, canEdit, isConflicted, onEdit, showNextTransport, onEditNextTransport, expandSignal, collapseSignal, isDragOverlay 
}: ItineraryCardProps) {
  const { categories } = useAppStore();
  const category = (categories || []).find(c => c.icon === item.icon) || { color: '#808080' };
  const subItems = item.sub_items ? JSON.parse(item.sub_items) : [];

  const endTimeStr = item.end_time || item.start_time || '23:59';
  const itemDateTime = new Date(`${item.date}T${endTimeStr}`);
  const isPast = Date.now() > itemDateTime.getTime();
  
  const [isCardExpanded, setIsCardExpanded] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // 💡 只有當有照片時，才根據全域信號自動展開
  const displayImage = item.image_url || null;

  useEffect(() => { 
    if (expandSignal && expandSignal > 0 && displayImage) setIsCardExpanded(true); 
  }, [expandSignal, displayImage]);
  
  useEffect(() => { 
    if (collapseSignal && collapseSignal > 0) setIsCardExpanded(false); 
  }, [collapseSignal]);

  const handleMainClick = () => {
    if (canEdit) onEdit();
    else if (displayImage) setIsCardExpanded(!isCardExpanded);
  };

  const getGoogleMapsLink = () => {
    if (item.google_place_id) return `https://www.google.com/maps/search/?api=1&query_place_id=${item.google_place_id}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.title)}`;
  };

  const getTransportIcon = () => {
    switch (item.next_transport_mode?.toLowerCase()) {
      case 'train': case 'subway': return <Train size={14} />;
      case 'bus': return <Bus size={14} />;
      case 'walking': return <Footprints size={14} />;
      case 'bicycling': return <Bike size={14} />;
      default: return <Car size={14} />;
    }
  };

  return (
    <div className="flex flex-col w-full mb-3 px-1">
      <div 
        onClick={handleMainClick} 
        className={clsx(
          "relative group bg-[#1c1c1e] rounded-[32px] transition-all cursor-pointer border flex flex-col overflow-hidden",
          canEdit && !isConflicted ? "hover:border-orange-500/50 bg-[#242426]" : "border-transparent hover:border-zinc-800",
          isConflicted ? "border-red-500 ring-2 ring-red-500/50" : "",
          isDragOverlay && "opacity-90 scale-105 shadow-2xl z-50"
        )}
      >
        {/* 卡片上半部內容 */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div 
                className="shrink-0 transition-all duration-500"
                style={{ 
                  color: category.color,
                  filter: !isPast ? `drop-shadow(0 0 8px ${category.color})` : 'none',
                  opacity: !isPast ? 1 : 0.5 
                }}
              >
                <DynamicIcon name={item.icon || 'MapPin'} size={20} />
              </div>
              <span className="text-zinc-400 font-mono font-bold tracking-wider text-[14px]">
                {item.start_time} — {item.end_time}
              </span>
              {item.rating && (
                <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/10">
                  <Star size={10} className="fill-current" />
                  <span className="text-[10px] font-bold">{item.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapsLink(), '_blank'); }}
              className="p-3 bg-zinc-800/50 hover:bg-orange-500/20 text-zinc-400 hover:text-orange-500 rounded-2xl transition-all border border-white/5 active:scale-90"
            >
              <Navigation2 size={18} />
            </button>
          </div>
          <div>
            <h4 className="text-[20px] font-black text-white leading-tight truncate">{item.title}</h4>
            {item.sync_conflict_warning && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-400 bg-red-400/10 px-2.5 py-0.5 rounded-lg">
                <AlertTriangle size={12} /> {item.sync_conflict_warning}
              </div>
            )}
          </div>
        </div>

        {/* 照片區塊 (僅在有照片時顯示) */}
        <AnimatePresence>
          {isCardExpanded && displayImage && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: "circOut" }}
            >
              <div className="relative w-full aspect-[4/3] bg-zinc-800 group/photo">
                <img src={displayImage} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsDetailsExpanded(!isDetailsExpanded); }}
                  className="absolute top-4 right-4 z-30 p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors border border-white/10"
                >
                  {isDetailsExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>

                {/* 黑色毛玻璃遮罩 (子項目) */}
                <AnimatePresence>
                  {isDetailsExpanded && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/80 backdrop-blur-md z-20 px-4 py-6 flex flex-col"
                      onClick={(e) => e.stopPropagation()} 
                    >
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                        <span className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] block px-1">Schedule Details</span>
                        {subItems.length > 0 ? subItems.map((sub: any, idx: number) => (
                          <div key={idx} className="w-full flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
                            <span className="text-[14px] font-bold text-zinc-100">{sub.title}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">{sub.start_time} - {sub.end_time}</span>
                          </div>
                        )) : <div className="text-sm text-zinc-600 italic px-1 mt-4">No sub-items scheduled.</div>}
                      </div>
                      {item.notes && <div className="mt-4 pt-4 border-t border-white/10 text-[13px] text-zinc-300 leading-relaxed italic line-clamp-6 px-1">{item.notes}</div>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 底部票根交通欄 */}
        {showNextTransport && (canEdit || !!item.next_transport_mode) && (
          <div 
            onClick={(e) => { e.stopPropagation(); if (canEdit) onEditNextTransport?.(); }}
            className={clsx(
              "w-full px-6 py-4 flex items-center justify-between border-t border-dashed border-zinc-700/60 transition-colors bg-black/30",
              canEdit ? "hover:bg-zinc-800/60 cursor-pointer" : "cursor-default"
            )}
          >
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Next Stop</span>
            {item.next_transport_mode ? (
              <div className="flex items-center gap-2">
                <div className="text-orange-500">{getTransportIcon()}</div>
                <span className="text-[12px] font-black uppercase tracking-wider text-zinc-200">
                  {item.next_transport_time ? item.next_transport_time.replace(' min', 'm') : 'Auto'}
                </span>
              </div>
            ) : (
              canEdit && <div className="flex items-center gap-1.5 text-zinc-600"><Plus size={14} /><span className="text-[10px] font-bold uppercase">Set</span></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}