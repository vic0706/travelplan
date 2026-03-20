import React, { useState, useEffect } from 'react';
import { Map, Car, Train, Bus, AlertTriangle, Star, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary } from '../types';
import { DynamicIcon } from './DynamicIcon';
import { useAppStore } from '../store';
import { clsx } from 'clsx';

interface ItineraryCardProps {
  item: Itinerary;
  onEdit: () => void;
  isEditing: boolean;
  allExpanded?: boolean; // 💡 新增：接收來自父元件（日期選單旁按鈕）的全域狀態
  isDragOverlay?: boolean;
}

export function ItineraryCard({ item, onEdit, isEditing, allExpanded, isDragOverlay }: ItineraryCardProps) {
  const { categories } = useAppStore();
  const category = categories?.find(c => c.icon === item.icon) || { color: '#808080' };
  const subItems = item.sub_items ? JSON.parse(item.sub_items) : [];

  // 判斷是否為過去行程
  const endTimeStr = item.end_time || item.start_time || '23:59';
  const itemDateTime = new Date(`${item.date}T${endTimeStr}`);
  const isPast = Date.now() > itemDateTime.getTime();
  
  // 狀態 1：卡片底部的照片展開區塊
  const [isCardExpanded, setIsCardExpanded] = useState(!isPast);
  // 狀態 2：照片上方的詳細資訊遮罩
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // 💡 核心修正：監聽「全域展開/收折」按鈕的變化
  useEffect(() => {
    if (allExpanded !== undefined) {
      setIsCardExpanded(allExpanded);
    }
  }, [allExpanded]);

  // 當非編輯模式且日期改變時的預設行為
  useEffect(() => {
    if (!isEditing && allExpanded === undefined) {
      setIsCardExpanded(!isPast);
    }
  }, [isPast, item.date, isEditing, allExpanded]);

  const handleMainClick = () => {
    if (isEditing) {
      onEdit();
    } else {
      setIsCardExpanded(!isCardExpanded);
    }
  };

  const toggleDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDetailsExpanded(!isDetailsExpanded);
  };

  const getGoogleMapsLink = () => {
    if (item.google_place_id) return `https://www.google.com/maps/search/?api=1&query_place_id=${item.google_place_id}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.title)}`;
  };

  const getTransportIcon = () => {
    switch (item.next_transport_mode?.toLowerCase()) {
      case 'train': case 'subway': return <Train size={16} />;
      case 'bus': return <Bus size={16} />;
      default: return <Car size={16} />;
    }
  };

  const displayImage = item.image_url || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80';

  return (
    <div 
      onClick={handleMainClick} 
      className={clsx(
        "relative group bg-[#1c1c1e] rounded-[32px] p-5 transition-all cursor-pointer border",
        isEditing ? "border-orange-500/30 bg-[#242426]" : "border-transparent hover:border-zinc-800",
        item.sync_conflict_warning && "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]",
        isDragOverlay && "opacity-90 scale-105 shadow-2xl z-50"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-4">
          {/* 第一行：ICON、時間、星星 */}
          <div className="flex items-center gap-3 mb-1.5">
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
              <div className="flex items-center gap-1 text-yellow-500 ml-1">
                <Star size={12} className="fill-current" />
                <span className="text-xs font-bold">{item.rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          <h4 className="text-[20px] font-bold text-white leading-tight truncate">
            {item.title}
          </h4>
          
          {item.sync_conflict_warning && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded-lg">
              <AlertTriangle size={12} /> {item.sync_conflict_warning}
            </div>
          )}
        </div>

        {/* 右側膠囊 */}
        <div className="flex flex-col items-center bg-[#242426] rounded-[20px] border border-white/5 shrink-0 w-12 overflow-hidden">
          <button 
            onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapsLink(), '_blank'); }}
            className="w-full p-3 text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors flex items-center justify-center"
          >
            <Map size={18} />
          </button>
          <div className="w-6 h-[1px] bg-zinc-700" />
          <div className="w-full flex flex-col items-center py-2 text-orange-500">
            {getTransportIcon()}
            <span className="text-[9px] font-bold mt-1">
              {item.next_transport_time || item.next_transport_auto_time || '0m'}
            </span>
          </div>
        </div>
      </div>

      {/* 第三行：照片展開區塊 */}
      <AnimatePresence>
        {isCardExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "circOut" }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              <div className="relative w-full aspect-[21/9] bg-zinc-800 rounded-[20px] border border-white/5 overflow-hidden group/photo">
                <img src={displayImage} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                
                <button 
                  onClick={toggleDetails}
                  className="absolute top-3 right-3 z-30 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors border border-white/10"
                >
                  {isDetailsExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>

                <AnimatePresence>
                  {isDetailsExpanded && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/75 backdrop-blur-sm z-20 p-4 flex flex-col"
                      onClick={(e) => e.stopPropagation()} 
                    >
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 block">Sub-itinerary</span>
                        {subItems.length > 0 ? subItems.map((sub: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-white/5 p-2.5 rounded-xl border border-white/5">
                            <span className="text-sm font-bold text-zinc-200">{sub.title}</span>
                            <span className="text-[11px] text-zinc-400 font-mono">{sub.start_time} - {sub.end_time}</span>
                          </div>
                        )) : <div className="text-xs text-zinc-500 italic mt-2">No sub-items scheduled.</div>}
                      </div>
                      {item.notes && (
                        <div className="mt-3 pt-3 border-t border-white/10 text-[13px] text-zinc-300 leading-relaxed italic line-clamp-3">{item.notes}</div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}