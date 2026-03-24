import React, { useState, useEffect } from 'react';
import { MapPin, Car, Train, Bus, AlertTriangle, Star, Plus, Footprints, Bike, Navigation2, Lock, Sparkles, Clock, ChevronRight, ChevronLeft } from 'lucide-react';
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

const getPreferenceLabel = (pref: string) => {
  switch (pref) {
    case 'morning': return '上午';
    case 'afternoon': return '下午';
    case 'evening': return '晚上';
    default: return '不限';
  }
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

  // 💡 監聽子項目選取：一旦選取，自動滑向第 3 頁 (Index 2)
  useEffect(() => {
    if (expandedSubIdx !== null) {
      setViewIndex(2);
    }
  }, [expandedSubIdx]);

  useEffect(() => { if (expandSignal && expandSignal > 0 && item.image_url) setIsCardExpanded(true); }, [expandSignal, item.image_url]);
  useEffect(() => { if (collapseSignal && collapseSignal > 0) setIsCardExpanded(false); }, [collapseSignal]);

  const getGoogleMapsLink = () => {
    const destination = item.google_place_id ? `place_id:${item.google_place_id}` : encodeURIComponent(item.address || item.title);
    return `http://googleusercontent.com/maps.google.com/maps?daddr=${destination}`;
  };

  const getTransportIcon = () => {
    // 💡 修正：直接根據模式回傳圖示
    switch (item.next_transport_mode?.toUpperCase()) {
      case 'TRANSIT': case 'TRAIN': return <Train size={14} />;
      case 'BUS': return <Bus size={14} />;
      case 'WALKING': return <Footprints size={14} />;
      case 'BICYCLING': return <Bike size={14} />;
      case 'DRIVING': return <Car size={14} />;
      default: return <Car size={14} />;
    }
  };

  const isFixed = item.is_time_fixed === 1;
  const isAiCalculated = !isFixed && (!!item.start_time && item.start_time !== '');
  const isCircuitBreaker = canEdit && (!!item.start_time) && (!item.next_transport_mode || item.next_transport_mode === '');

  // 💡 進階滑動判定
  const handleDragEnd = (e: any, info: any) => {
    const swipeThreshold = 50;
    const velocityThreshold = 500;
    const maxIndex = expandedSubIdx !== null ? 2 : 1;

    let newIndex = viewIndex;
    if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      newIndex = Math.min(viewIndex + 1, maxIndex);
    } else if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      newIndex = Math.max(viewIndex - 1, 0);
    }

    // 💡 自動清除邏輯：如果從第 3 頁滑回第 2 頁，清除選取的子項目
    if (viewIndex === 2 && newIndex === 1) {
      setExpandedSubIdx(null);
    }
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
        
        {/* 第一行 (Icon, Time, Nav) */}
        <div className="p-4 pb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div style={{ color: isCircuitBreaker ? '#ef4444' : category.color, filter: !isPast ? `drop-shadow(0 0 6px ${category.color}33)` : 'none' }}>
              <DynamicIcon name={item.icon || 'MapPin'} size={18} />
            </div>
            <div className="flex items-center gap-1.5">
              {item.start_time ? (
                <span className={clsx("font-mono font-black tracking-tight text-[13px]", isPast ? "text-zinc-500" : "text-zinc-100")}>
                  {item.start_time} — {item.end_time}
                </span>
              ) : (
                <span className="text-zinc-500 font-black text-[10px] uppercase tracking-wider">{getPreferenceLabel(item.time_preference || 'anytime')}</span>
              )}
              {isFixed && <Lock size={10} className="text-zinc-600" />}
              {isAiCalculated && <Sparkles size={10} className="text-orange-500/60" />}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapsLink(), '_blank'); }} className="p-2 bg-zinc-800/40 rounded-xl text-zinc-400 hover:text-orange-500 transition-all border border-white/5 active:scale-90">
            <Navigation2 size={14} />
          </button>
        </div>

        {/* 第二行 (標題) */}
        <div className="px-4 pb-3" onClick={() => (canEdit ? onEdit() : item.image_url && setIsCardExpanded(!isCardExpanded))}>
          <h4 className={clsx("text-[19px] font-black leading-tight truncate cursor-pointer", isPast ? "text-zinc-600" : "text-white")}>
            {item.title}
          </h4>
        </div>

        {/* 第三行 (動態三段滑動區塊) */}
        <AnimatePresence>
          {isCardExpanded && item.image_url && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative">
              <div className="relative w-full aspect-[21/9] bg-zinc-900 overflow-hidden cursor-grab active:cursor-grabbing">
                <motion.div 
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={handleDragEnd}
                  animate={{ x: `-${viewIndex * 100}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  className="flex w-[300%] h-full"
                >
                  {/* Page 0: 照片 */}
                  <div className="w-1/3 h-full shrink-0 relative">
                    <img src={item.image_url} alt="place" className="w-full h-full object-cover opacity-70 pointer-events-none" />
                  </div>

                  {/* Page 1: 摘要清單 */}
                  <div className="w-1/3 h-full shrink-0 bg-black/85 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3 backdrop-blur-md">
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
                          <div key={idx} className="flex items-center justify-between bg-white/5 p-2.5 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <span className="text-[9px] text-zinc-500 font-mono shrink-0">{sub.start_time}</span>
                              <span className="text-[12px] font-bold text-zinc-200 truncate">{sub.title}</span>
                            </div>
                            {sub.notes && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setExpandedSubIdx(idx); }} 
                                className="p-1 bg-zinc-800 rounded-md text-orange-500 hover:bg-zinc-700"
                              >
                                <ChevronRight size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1.5 px-1 mt-1">
                      {isConflicted && <div className="text-red-500 font-bold text-[11px] flex items-center gap-1.5"><AlertTriangle size={12} /> 行程時間衝突</div>}
                      {closedWarning && <div className="text-red-500 font-bold text-[11px] flex items-center gap-1.5"><Clock size={12} /> ⚠️ {closedWarning}</div>}
                      {item.notes && <p className="text-[12px] text-zinc-400 leading-relaxed italic whitespace-pre-wrap">{item.notes}</p>}
                    </div>
                  </div>

                  {/* Page 2: 子項目詳細備註 (自動產生) */}
                  <div className="w-1/3 h-full shrink-0 bg-zinc-900 p-5 flex flex-col gap-3 relative">
                    {expandedSubIdx !== null && subItems[expandedSubIdx] && (
                      <>
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <button onClick={() => { setViewIndex(1); setExpandedSubIdx(null); }} className="flex items-center gap-1 text-orange-500 font-bold text-xs">
                            <ChevronLeft size={16} /> Back
                          </button>
                          <span className="text-[10px] text-zinc-500 font-mono">{subItems[expandedSubIdx].start_time} - {subItems[expandedSubIdx].end_time}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                          <h5 className="text-white font-bold text-sm mb-2">{subItems[expandedSubIdx].title}</h5>
                          <p className="text-zinc-400 text-xs leading-relaxed italic whitespace-pre-wrap">{subItems[expandedSubIdx].notes || "No notes."}</p>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>

                {/* 💡 動態分頁指示器 (Dots) */}
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 z-30 pointer-events-none">
                  <div className="flex bg-black/20 backdrop-blur-sm px-2 py-1 rounded-full gap-1.5">
                    {/* 點 1: 照片 */}
                    <div className={clsx("w-1.5 h-1.5 rounded-full transition-all duration-300", viewIndex === 0 ? "bg-white scale-125 shadow-[0_0_8px_white]" : "bg-white/30")} />
                    
                    {/* 點 2: 摘要 */}
                    <div className={clsx(
                      "w-1.5 h-1.5 rounded-full transition-all duration-300", 
                      viewIndex === 1 ? (hasWarning ? "bg-red-500 scale-125 shadow-[0_0_8px_#ef4444]" : "bg-white scale-125 shadow-[0_0_8px_white]") : (hasWarning ? "bg-red-500/50" : "bg-white/30")
                    )} />

                    {/* 💡 點 3: 只有在選取子項目時才顯示 */}
                    {expandedSubIdx !== null && (
                      <motion.div 
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className={clsx("w-1.5 h-1.5 rounded-full transition-all duration-300", viewIndex === 2 ? "bg-white scale-125 shadow-[0_0_8px_white]" : "bg-white/30")} 
                      />
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 第四行 (Next Stop) */}
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
                <div className={isCircuitBreaker ? "text-white" : "text-orange-500"}>{getTransportIcon()}</div>
                <div className={clsx("flex items-center gap-1 text-[11px] font-black tracking-tight", isCircuitBreaker ? "text-white" : "text-zinc-200")}>
                  {item.next_transport_mode === 'auto' ? (
                    <>{(item as any).next_transport_auto_time ? `${(item as any).next_transport_auto_time}m` : 'Auto'}<Sparkles size={9} /></>
                  ) : (
                    item.next_transport_time?.replace(' min', 'm') || 'Set'
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