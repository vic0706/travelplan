import React, { useState, useEffect } from 'react';
import { MapPin, Car, Train, Bus, AlertTriangle, Star, Plus, Footprints, Bike, Navigation2, Lock, Sparkles, Clock, X } from 'lucide-react';
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

const safeParse = (data: any) => {
  if (Array.isArray(data)) return data;
  if (!data || data === "" || data === "null") return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
};

const checkIsClosed = (dateStr: string, openingHoursJson: string | undefined | null) => {
  if (!openingHoursJson) return null;
  try {
    const data = JSON.parse(openingHoursJson);
    if (data.periods?.length === 1) {
      const p = data.periods[0];
      if (p.open?.day === 0 && p.open?.hour === 0 && !p.close) return null;
    }
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const isOpenThisDay = data.periods?.some((p: any) => p.open?.day === dayOfWeek);
    return !isOpenThisDay ? "排定日期可能公休" : null;
  } catch (e) { return null; }
};

export function ItineraryCard({ 
  item, canEdit, isConflicted, onEdit, showNextTransport, onEditNextTransport, expandSignal, collapseSignal, isDragOverlay 
}: ItineraryCardProps) {
  const { categories } = useAppStore();
  const category = (categories || []).find(c => c.icon === item.icon) || { color: '#808080' };
  
  const tags = safeParse(item.tags);
  const subItems = safeParse(item.sub_items);
  
  const endTimeStr = item.end_time || item.start_time || '23:59';
  const itemDateTime = new Date(`${item.date}T${endTimeStr}`);
  const isPast = Date.now() > itemDateTime.getTime();

  const [isCardExpanded, setIsCardExpanded] = useState(!isPast && !!item.image_url);
  const [viewIndex, setViewIndex] = useState(0); 
  const [expandedSubIdx, setExpandedSubIdx] = useState<number | null>(null);

  const closedWarning = checkIsClosed(item.date, item.opening_hours);
  const hasWarning = !!closedWarning || !!item.sync_conflict_warning || !!isConflicted;

  // 💡 邏輯：判定是否有足夠資料需要「右滑」(排除只有星星的情況)
  const hasDetailContent = tags.length > 0 || subItems.length > 0 || !!item.notes || hasWarning;

  // 💡 核心修正：補回漏掉的 isCircuitBreaker 宣告
  const isCircuitBreaker = canEdit && (!!item.start_time) && (!item.next_transport_mode || item.next_transport_mode === '');

  useEffect(() => {
    if (expandedSubIdx !== null) setViewIndex(2);
  }, [expandedSubIdx]);

  useEffect(() => { if (expandSignal && expandSignal > 0 && item.image_url) setIsCardExpanded(true); }, [expandSignal, item.image_url]);
  useEffect(() => { if (collapseSignal && collapseSignal > 0) setIsCardExpanded(false); }, [collapseSignal]);

  const getGoogleMapsLink = () => {
    const destination = item.google_place_id ? `place_id:${item.google_place_id}` : encodeURIComponent(item.address || item.title);
    return `http://googleusercontent.com/maps.google.com/maps?daddr=${destination}`;
  };

  const getTransportIcon = () => {
    const mode = item.next_transport_mode?.toLowerCase();
    switch (mode) {
      case 'transit': case 'train': return <Train size={14} />;
      case 'bus': return <Bus size={14} />;
      case 'walking': return <Footprints size={14} />;
      case 'bicycling': return <Bike size={14} />;
      case 'driving': return <Car size={14} />;
      default: return <Car size={14} />;
    }
  };

  const manualVal = parseInt(item.next_transport_time?.toString().replace(/\D/g, '') || '0', 10);
  const autoVal = Math.round(Number((item as any).next_transport_auto_time || 0));

  const handleDragEnd = (e: any, info: any) => {
    const swipeThreshold = 50;
    const velocityThreshold = 500;
    const maxIndex = expandedSubIdx !== null ? 2 : (hasDetailContent ? 1 : 0);

    let newIndex = viewIndex;
    if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      newIndex = Math.min(viewIndex + 1, maxIndex);
    } else if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      newIndex = Math.max(viewIndex - 1, 0);
    }

    if (viewIndex === 2 && newIndex === 1) setExpandedSubIdx(null);
    setViewIndex(newIndex);
  };

  return (
    <div className={clsx("flex flex-col w-full mb-3 px-1 transition-all", isDragOverlay && "opacity-90 scale-105 shadow-2xl z-50")}>
      <div className={clsx(
        "relative flex flex-col bg-[#1c1c1e] rounded-[32px] overflow-hidden border transition-all",
        canEdit && !isConflicted && !isCircuitBreaker ? "hover:border-zinc-700 border-zinc-800" : "border-zinc-800",
        isConflicted && "border-red-500 ring-2 ring-red-500/50",
        isCircuitBreaker && "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-[#2a1a1a]"
      )}>
        
        {/* Header Section */}
        <div className="p-4 pb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div style={{ color: isCircuitBreaker ? '#ef4444' : category.color, filter: !isPast ? `drop-shadow(0 0 6px ${category.color}33)` : 'none' }}>
              <DynamicIcon name={item.icon || 'MapPin'} size={18} />
            </div>
            <div className="flex items-center gap-1.5">
              {item.start_time && (
                <span className={clsx("font-mono font-black tracking-tight text-[13px]", isPast ? "text-zinc-500" : "text-zinc-100")}>
                  {item.start_time} — {item.end_time}
                </span>
              )}
              {item.is_time_fixed === 1 && <Lock size={10} className="text-zinc-600" />}
              {item.start_time && !item.is_time_fixed && !isPast && <Sparkles size={10} className="text-orange-500/60" />}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapsLink(), '_blank'); }} className="p-2 bg-zinc-800/40 rounded-xl text-zinc-400 hover:text-orange-500 transition-all border border-white/5 active:scale-90">
            <Navigation2 size={14} />
          </button>
        </div>

        {/* Title Section */}
        <div className="px-4 pb-3" onClick={() => (canEdit ? onEdit() : item.image_url && setIsCardExpanded(!isCardExpanded))}>
          <h4 className={clsx("text-[19px] font-black leading-tight truncate cursor-pointer", isPast ? "text-zinc-600" : "text-white")}>
            {item.title}
          </h4>
        </div>

        {/* Dynamic Image Section */}
        <AnimatePresence>
          {isCardExpanded && item.image_url && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative">
              <div className="relative w-full aspect-[21/9] bg-zinc-900 overflow-hidden cursor-grab active:cursor-grabbing">
                
                {/* 💡 背景照片固定，不隨容器滑動 */}
                <img 
                  src={item.image_url} 
                  alt="place" 
                  className={clsx(
                    "absolute inset-0 w-full h-full object-cover z-0 pointer-events-none transition-opacity duration-500",
                    isPast ? "opacity-30" : "opacity-80"
                  )} 
                />

                {/* 💡 滑動內容層：寬度維持 100%，使用絕對定位排列頁面 */}
                <motion.div 
                  drag={hasDetailContent ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={handleDragEnd}
                  animate={{ x: `-${viewIndex * 100}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  className="absolute inset-0 w-full h-full z-10"
                >
                  {/* Page 0: 透明 (點擊照片直接跳到 Page 1) */}
                  <div className="absolute inset-0 left-0 w-full h-full" onClick={() => hasDetailContent && setViewIndex(1)} />

                  {/* Page 1: 摘要清單 (毛玻璃效果) */}
                  <div className="absolute inset-0 left-[100%] w-full h-full bg-black/40 backdrop-blur-md p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.rating && (
                        <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-lg border border-yellow-500/20">
                          <Star size={10} className="fill-current" />
                          <span className="text-[11px] font-black">{item.rating.toFixed(1)}</span>
                        </div>
                      )}
                      {tags.map((t: string) => (
                        <span key={t} className="text-[9px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/10">#{t}</span>
                      ))}
                    </div>

                    {subItems.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {subItems.map((sub: any, idx: number) => (
                          <div 
                            key={idx} 
                            onClick={(e) => { if (sub.notes) { e.stopPropagation(); setExpandedSubIdx(idx); } }}
                            className={clsx(
                              "flex items-center justify-between p-2.5 rounded-xl border transition-all",
                              sub.notes ? "bg-white/10 border-white/10 hover:bg-white/20 cursor-pointer" : "bg-white/5 border-white/5 opacity-80"
                            )}
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <span className="text-[9px] text-zinc-400 font-mono shrink-0">{sub.start_time}</span>
                              <span className="text-[12px] font-bold text-zinc-200 truncate">{sub.title}</span>
                            </div>
                            {sub.notes && (
                              <div className="flex items-center gap-1 text-orange-500 animate-pulse">
                                <Sparkles size={10} /><span className="text-[8px] font-black uppercase tracking-tighter">Note</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1.5 px-1 mt-1">
                      {isConflicted && <div className="text-red-500 font-bold text-[11px] flex items-center gap-1.5"><AlertTriangle size={12} /> 行程時間衝突</div>}
                      {closedWarning && <div className="text-red-500 font-bold text-[11px] flex items-center gap-1.5"><Clock size={12} /> ⚠️ {closedWarning}</div>}
                      {item.notes && <p className="text-[12px] text-zinc-300 leading-relaxed italic whitespace-pre-wrap">{item.notes}</p>}
                    </div>
                  </div>

                  {/* Page 2: 子項目詳細備註 (模糊背景) */}
                  <div className="absolute inset-0 left-[200%] w-full h-full bg-black/60 backdrop-blur-md p-5 flex flex-col gap-4">
                    {expandedSubIdx !== null && subItems[expandedSubIdx] && (
                      <>
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                          <div className="bg-white/10 px-2 py-1 rounded-lg flex items-center gap-2">
                            <Clock size={12} className="text-zinc-400" />
                            <span className="text-[11px] text-zinc-200 font-mono font-bold">
                              {subItems[expandedSubIdx].start_time} — {subItems[expandedSubIdx].end_time}
                            </span>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setViewIndex(1); setExpandedSubIdx(null); }} 
                            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full text-zinc-400 hover:text-white transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar pt-1">
                          <h5 className="text-[16px] font-black text-white mb-3 tracking-tight">{subItems[expandedSubIdx].title}</h5>
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <p className="text-zinc-300 text-[13px] leading-relaxed italic whitespace-pre-wrap">
                              {subItems[expandedSubIdx].notes || "No additional notes recorded."}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>

                {/* Indicators */}
                {hasDetailContent && (
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 z-30 pointer-events-none">
                    <div className="flex bg-black/20 backdrop-blur-sm px-2 py-1 rounded-full gap-1.5">
                      <div className={clsx("w-1.5 h-1.5 rounded-full transition-all duration-300", viewIndex === 0 ? "bg-white scale-125 shadow-[0_0_8px_white]" : "bg-white/30")} />
                      <div className={clsx("w-1.5 h-1.5 rounded-full transition-all duration-300", viewIndex === 1 ? (hasWarning ? "bg-red-500 scale-125 shadow-[0_0_8px_#ef4444]" : "bg-white scale-125 shadow-[0_0_8px_white]") : (hasWarning ? "bg-red-500/50" : "bg-white/30"))} />
                      {expandedSubIdx !== null && (
                        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={clsx("w-1.5 h-1.5 rounded-full transition-all duration-300", viewIndex === 2 ? "bg-white scale-125 shadow-[0_0_8px_white]" : "bg-white/30")} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer: Next Transport */}
        {showNextTransport && (canEdit || !!item.next_transport_mode) && (isCardExpanded || !isPast) && (
          <button 
            type="button" disabled={!canEdit}
            onClick={(e) => { e.stopPropagation(); if (canEdit && onEditNextTransport) onEditNextTransport(); }}
            className={clsx(
              "w-full px-5 py-3.5 flex items-center justify-between transition-colors",
              canEdit ? "cursor-pointer" : "cursor-default",
              isCircuitBreaker ? "bg-red-500 text-white font-black" : "bg-transparent hover:bg-zinc-800/40"
            )}
          >
            <span className={clsx("text-[9px] font-black uppercase tracking-[0.2em]", isCircuitBreaker ? "text-white" : "text-zinc-500")}>Next Stop</span>
            
            {item.next_transport_mode ? (
              <div className="flex items-center gap-2">
                <div className={isCircuitBreaker ? "text-white" : "text-orange-500"}>
                  {getTransportIcon()}
                </div>
                <div className={clsx("flex items-center gap-1 text-[11px] font-black tracking-tight", isCircuitBreaker ? "text-white" : "text-orange-500")}>
                  {manualVal > 0 ? (
                    `${manualVal}m`
                  ) : autoVal > 0 ? (
                    <>{autoVal}m<Sparkles size={9} className="animate-pulse" /></>
                  ) : (
                    'Auto'
                  )}
                </div>
              </div>
            ) : (
              <div className={clsx("flex items-center gap-1.5 opacity-60", isCircuitBreaker ? "text-white" : "text-zinc-500")}>
                <Plus size={12} /><span className="text-[9px] font-bold uppercase">Add</span>
              </div>
            )}
          </button>
        )}
      </div>
    </div>
  );
}