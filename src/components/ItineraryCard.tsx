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
  const category = categories?.find(c => c.icon === item.icon) || { color: '#808080' };
  const subItems = item.sub_items ? JSON.parse(item.sub_items) : [];

  const endTimeStr = item.end_time || item.start_time || '23:59';
  const itemDateTime = new Date(`${item.date}T${endTimeStr}`);
  const isPast = Date.now() > itemDateTime.getTime();
  
  const [isCardExpanded, setIsCardExpanded] = useState(!isPast);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  useEffect(() => { if (expandSignal && expandSignal > 0) setIsCardExpanded(true); }, [expandSignal]);
  useEffect(() => { if (collapseSignal && collapseSignal > 0) setIsCardExpanded(false); }, [collapseSignal]);

  const handleMainClick = () => {
    if (canEdit) onEdit();
    else setIsCardExpanded(!isCardExpanded);
  };

  const toggleDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDetailsExpanded(!isDetailsExpanded);
  };

  const getGoogleMapsLink = () => {
    if (item.google_place_id) return `https://www.google.com/maps/place/?q=place_id:${item.google_place_id}`;
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

  const displayImage = item.image_url || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80';
  const hasConflict = isConflicted || !!item.sync_conflict_warning;

  return (
    <div className="flex flex-col w-full">
      
      {/* 💡 主卡片區塊 */}
      <div 
        onClick={handleMainClick} 
        className={clsx(
          "relative group bg-[#1c1c1e] rounded-[32px] p-5 transition-all cursor-pointer border z-10",
          canEdit && !hasConflict ? "hover:border-orange-500/50 bg-[#242426]" : "border-transparent hover:border-zinc-800",
          hasConflict ? "border-red-500 ring-2 ring-red-500/50" : "",
          isDragOverlay && "opacity-90 scale-105 shadow-2xl z-50"
        )}
      >
        {/* 第一行: ICON(發光)、時間、星星、導航 */}
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
            className="p-2.5 bg-zinc-800/50 hover:bg-orange-500/20 text-zinc-400 hover:text-orange-500 rounded-2xl transition-all border border-white/5 active:scale-90"
          >
            <Navigation2 size={20} className="fill-current opacity-20" />
            <Navigation2 size={20} className="absolute inset-2.5" />
          </button>
        </div>

        {/* 第二行: 標題 */}
        <div className="mb-2">
          <h4 className="text-[22px] font-black text-white leading-tight truncate">
            {item.title}
          </h4>
          {item.sync_conflict_warning && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-400 bg-red-400/10 px-2.5 py-0.5 rounded-lg">
              <AlertTriangle size={12} /> {item.sync_conflict_warning}
            </div>
          )}
        </div>

        {/* 第三行: 照片 (比例再放大至 4/3，非常震撼) */}
        <AnimatePresence>
          {isCardExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: "circOut" }}
              className="overflow-hidden -mx-5 -mb-5 mt-5"
            >
              <div className="relative w-full aspect-[4/3] bg-zinc-800 rounded-b-[32px] border-t border-zinc-800/50 overflow-hidden group/photo">
                <img src={displayImage} alt={item.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/photo:scale-105" />
                
                <button 
                  onClick={toggleDetails}
                  className="absolute top-4 right-4 z-30 p-3 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white transition-colors border border-white/10"
                >
                  {isDetailsExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>

                <AnimatePresence>
                  {isDetailsExpanded && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/80 backdrop-blur-md z-20 p-6 flex flex-col"
                      onClick={(e) => e.stopPropagation()} 
                    >
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                        <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Schedule Details</span>
                        {subItems.length > 0 ? subItems.map((sub: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-white/5 p-3.5 rounded-2xl border border-white/5">
                            <span className="text-[15px] font-bold text-zinc-100">{sub.title}</span>
                            <span className="text-xs text-zinc-400 font-mono">{sub.start_time} - {sub.end_time}</span>
                          </div>
                        )) : <div className="text-sm text-zinc-500 italic mt-2">No sub-items scheduled.</div>}
                      </div>
                      {item.notes && <div className="mt-4 pt-4 border-t border-white/10 text-[14px] text-zinc-300 leading-relaxed italic line-clamp-6">{item.notes}</div>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 💡 Next Location 橋樑：大幅增加上下間距 (py-5) 與 獨立設計感 */}
      {showNextTransport && (canEdit || !!item.next_transport_mode) && (
        <div className="relative py-5 flex items-center justify-center -mt-2">
          {/* 連接虛線 (更清晰) */}
          <div className="absolute inset-y-0 left-1/2 w-[2px] border-l-[2px] border-dashed border-zinc-700/60 -translate-x-1/2" />
          
          {/* 獨立的交通膠囊 (Pill) */}
          <button 
            onClick={(e) => { e.stopPropagation(); if (canEdit) onEditNextTransport?.(); }}
            disabled={!canEdit}
            className={clsx(
              "relative z-10 px-5 py-2 rounded-full border shadow-xl transition-all flex items-center gap-2",
              canEdit ? "hover:scale-105 active:scale-95" : "cursor-default",
              item.next_transport_mode 
                ? "bg-zinc-900 border-zinc-700 text-orange-500" 
                : "bg-zinc-900 border-zinc-800 text-zinc-600"
            )}
          >
            {item.next_transport_mode ? (
              <>
                <div className="p-0.5">{getTransportIcon()}</div>
                {/* 讓文字變成白色/淺灰，跟橘色 icon 對比，更精緻 */}
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-200">
                  {item.next_transport_time ? item.next_transport_time.replace(' min', 'm') : 'Auto'}
                </span>
              </>
            ) : (
              canEdit && <Plus size={16} className="text-zinc-500" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}