import React, { useState, useEffect } from 'react';
import { Map, Car, Train, Bus, AlertTriangle, Star, Maximize2, Minimize2, Plus, Footprints, Bike } from 'lucide-react';
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
  selectedDate?: Date;
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

  // 1. 判斷是否為過去行程 (決定發光與預設狀態) [cite: 494-495]
  const endTimeStr = item.end_time || item.start_time || '23:59';
  const itemDateTime = new Date(`${item.date}T${endTimeStr}`);
  const isPast = Date.now() > itemDateTime.getTime();
  
  const [isCardExpanded, setIsCardExpanded] = useState(!isPast);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // 💡 聽從日期選單旁的「全展開」指令 [cite: 496]
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
    return `http://googleusercontent.com/maps.google.com/8{encodeURIComponent(item.address || item.title)}`;
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
    <div 
      onClick={handleMainClick} 
      className={clsx(
        "relative group bg-[#1c1c1e] rounded-[32px] p-5 transition-all cursor-pointer border",
        canEdit && !hasConflict ? "hover:border-orange-500/50 bg-[#242426]" : "border-transparent hover:border-zinc-800",
        hasConflict ? "border-red-500 ring-2 ring-red-500/50" : "",
        isDragOverlay && "opacity-90 scale-105 shadow-2xl z-50"
      )}
    >
      {/* 💡 第一行: ICON(發光)、時間、星星、橫向膠囊 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {/* 發光 ICON */}
          <div 
            className="shrink-0 transition-all duration-500 flex items-center justify-center"
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
            <div className="flex items-center gap-1 text-yellow-500">
              <Star size={12} className="fill-current" />
              <span className="text-xs font-bold">{item.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* 💡 橫向膠囊 (整合導航與交通) */}
        <div className="flex items-center bg-[#242426] rounded-full border border-white/5 overflow-hidden shadow-lg h-9">
          <button 
            onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapsLink(), '_blank'); }}
            className="px-3 h-full text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors flex items-center"
          >
            <Map size={16} />
          </button>
          
          {showNextTransport && (canEdit || !!item.next_transport_mode) && (
            <>
              <div className="h-4 w-[1px] bg-zinc-700/50" />
              <button 
                onClick={(e) => { e.stopPropagation(); if (canEdit) onEditNextTransport?.(); }}
                disabled={!canEdit}
                className={clsx(
                  "px-3 h-full flex items-center gap-1.5 transition-colors",
                  canEdit ? "hover:bg-zinc-700/50 cursor-pointer" : "cursor-default",
                  item.next_transport_mode ? "text-orange-500" : "text-zinc-500"
                )}
              >
                {item.next_transport_mode ? (
                  <>
                    {getTransportIcon()}
                    <span className="text-[10px] font-bold font-mono">
                      {item.next_transport_time ? item.next_transport_time.replace(' min', 'm') : 'Auto'}
                    </span>
                  </>
                ) : (
                  <Plus size={16} />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 💡 第二行: 標題獨立顯示 */}
      <div className="mb-2">
        <h4 className="text-[21px] font-extrabold text-white leading-tight truncate">
          {item.title}
        </h4>
        {item.sync_conflict_warning && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-400 bg-red-400/10 px-2.5 py-0.5 rounded-lg">
            <AlertTriangle size={12} /> {item.sync_conflict_warning}
          </div>
        )}
      </div>

      {/* 💡 第三行: 照片高度放大 (16/9 比例) 並滿版 */}
      <AnimatePresence>
        {isCardExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: "circOut" }}
            className="overflow-hidden -mx-5 -mb-5 mt-4"
          >
            <div className="relative w-full aspect-[16/9] bg-zinc-800 rounded-b-[32px] border-t border-zinc-800 overflow-hidden group/photo">
              <img src={displayImage} alt={item.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/photo:scale-105" />
              
              {/* 遮罩展開鈕 */}
              <button 
                onClick={toggleDetails}
                className="absolute top-4 right-4 z-30 p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors border border-white/10"
              >
                {isDetailsExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>

              {/* 黑色毛玻璃遮罩詳細資訊 [cite: 519-523] */}
              <AnimatePresence>
                {isDetailsExpanded && (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-md z-20 p-6 flex flex-col"
                    onClick={(e) => e.stopPropagation()} 
                  >
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                      <span className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.1em] block">Detailed Schedule</span>
                      {subItems.length > 0 ? subItems.map((sub: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-white/5 p-3.5 rounded-2xl border border-white/5">
                          <span className="text-[15px] font-bold text-zinc-100">{sub.title}</span>
                          <span className="text-xs text-zinc-400 font-mono">{sub.start_time} - {sub.end_time}</span>
                        </div>
                      )) : <div className="text-sm text-zinc-500 italic mt-2">No sub-items scheduled.</div>}
                    </div>

                    {item.notes && (
                      <div className="mt-4 pt-4 border-t border-white/10 text-[14px] text-zinc-300 leading-relaxed italic line-clamp-4">
                        {item.notes}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}