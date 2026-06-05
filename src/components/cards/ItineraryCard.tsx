import React, { useState, useEffect } from 'react';
import { Car, Train, Bus, AlertTriangle, Star, Plus, Footprints, Bike, Navigation2, Sparkles, Clock, Asterisk, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary } from '../../types';
import { DynamicIcon } from '../common/DynamicIcon';
import { useAppStore } from '../../store';
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
  if (!data || data === '' || data === 'null') return [];
  try { const p = JSON.parse(data); return Array.isArray(p) ? p : []; }
  catch { return []; }
};

const checkIsClosed = (dateStr: string, openingHoursJson?: string | null) => {
  if (!openingHoursJson) return null;
  try {
    const data = JSON.parse(openingHoursJson);
    if (data.periods?.length === 1) {
      const p = data.periods[0];
      if (p.open?.day === 0 && p.open?.hour === 0 && !p.close) return null;
    }
    const dayOfWeek = new Date(dateStr).getDay();
    const isOpen = data.periods?.some((p: any) => p.open?.day === dayOfWeek);
    return !isOpen ? '排定日期可能公休' : null;
  } catch { return null; }
};

export function ItineraryCard({
  item, canEdit, isConflicted, onEdit, showNextTransport, onEditNextTransport,
  expandSignal, collapseSignal, isDragOverlay,
}: ItineraryCardProps) {
  const { categories } = useAppStore();
  const category = (categories || []).find((c: any) => c.icon === item.icon) || { color: '#808080' };

  const tags     = safeParse(item.tags);
  const subItems = safeParse(item.sub_items);

  const endTimeStr = item.end_time || item.start_time || '23:59';
  const isPast = Date.now() > new Date(`${item.date}T${endTimeStr}`).getTime();

  const closedWarning    = checkIsClosed(item.date, item.opening_hours);
  const hasWarning       = !!closedWarning || !!item.sync_conflict_warning || !!isConflicted;
  const isCircuitBreaker = canEdit && !!item.start_time && (!item.next_transport_mode || item.next_transport_mode === '');

  const hasContent = !!item.rating || subItems.length > 0 || tags.length > 0 || !!item.notes || hasWarning;
  const hasPhoto   = !!item.image_url;
  const canExpand  = hasPhoto || hasContent;

  const [isExpanded,  setIsExpanded]  = useState(!isPast && hasPhoto);
  const [subItemIdx,  setSubItemIdx]  = useState<number | null>(null);

  useEffect(() => {
    if (expandSignal && expandSignal > 0 && hasPhoto) setIsExpanded(true);
  }, [expandSignal, hasPhoto]);

  useEffect(() => {
    if (collapseSignal && collapseSignal > 0) { setIsExpanded(false); setSubItemIdx(null); }
  }, [collapseSignal]);

  const getGoogleMapsLink = () => {
    const dest = item.google_place_id
      ? `place_id:${item.google_place_id}`
      : encodeURIComponent(item.address || item.title);
    return `http://googleusercontent.com/maps.google.com/maps?daddr=${dest}`;
  };

  const getTransportIcon = () => {
    switch (item.next_transport_mode?.toLowerCase()) {
      case 'transit': case 'train': return <Train size={14} />;
      case 'bus':       return <Bus size={14} />;
      case 'walking':   return <Footprints size={14} />;
      case 'bicycling': return <Bike size={14} />;
      default:          return <Car size={14} />;
    }
  };

  const manualVal = parseInt(item.next_transport_time?.toString().replace(/\D/g, '') || '0', 10);
  const autoVal   = Math.round(Number((item as any).next_transport_auto_time || 0));

  const handleTitleClick = () => {
    if (canEdit) { onEdit(); return; }
    if (!canExpand) return;
    setIsExpanded(v => !v);
    setSubItemIdx(null);
  };

  const renderContent = () => (
    <div className="space-y-3">
      {/* 評分 + Tags */}
      {(item.rating || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.rating && (
            <div className="flex items-center gap-1 bg-yellow-500/15 border border-yellow-500/25 rounded-xl px-2.5 py-1">
              <Star size={11} className="text-yellow-400 fill-yellow-400" />
              <span className="text-[12px] font-black text-yellow-300">{(item.rating as number).toFixed(1)}</span>
              {(item as any).reviews_count && (
                <span className="text-[9px] text-yellow-500/60">({(item as any).reviews_count.toLocaleString()})</span>
              )}
            </div>
          )}
          {tags.map((t: string) => (
            <span key={t} className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-lg border border-orange-500/20">#{t}</span>
          ))}
        </div>
      )}

      {/* 子活動列表 */}
      {subItems.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">子活動</div>
          {subItems.map((sub: any, idx: number) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => { e.stopPropagation(); setSubItemIdx(idx); }}
              className="w-full flex items-center gap-3 px-3.5 py-3 bg-white/5 active:bg-white/10 border border-white/8 rounded-2xl transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-zinc-200 truncate">{sub.title}</div>
                {sub.start_time && (
                  <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                    {sub.start_time}{sub.end_time && sub.end_time !== sub.start_time ? ` — ${sub.end_time}` : ''}
                  </div>
                )}
              </div>
              {(sub.notes || sub.tags?.length > 0) && (
                <Asterisk size={10} strokeWidth={3} className="shrink-0 text-zinc-600" />
              )}
              <ChevronRight size={13} className="shrink-0 text-zinc-700" />
            </button>
          ))}
        </div>
      )}

      {/* 警告 + 備註 */}
      {(hasWarning || item.notes) && (
        <div className="space-y-1.5">
          {isConflicted && (
            <div className="flex items-center gap-1.5 text-red-400 text-[11px] font-bold">
              <AlertTriangle size={12} />行程時間衝突
            </div>
          )}
          {closedWarning && (
            <div className="flex items-center gap-1.5 text-red-400 text-[11px] font-bold">
              <Clock size={12} />⚠️ {closedWarning}
            </div>
          )}
          {item.sync_conflict_warning && !closedWarning && (
            <div className="flex items-center gap-1.5 text-orange-400 text-[11px] font-bold">
              <AlertTriangle size={12} />{item.sync_conflict_warning}
            </div>
          )}
          {item.notes && (
            <p className="text-[12px] text-zinc-400 leading-relaxed italic whitespace-pre-wrap">{item.notes}</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={clsx('flex flex-col w-full mb-3 px-1 transition-all', isDragOverlay && 'opacity-90 scale-105 shadow-2xl z-50')}>
      <div className={clsx(
        'relative flex flex-col bg-[#1c1c1e] rounded-[32px] overflow-hidden border transition-all',
        isConflicted     && 'border-red-500 ring-2 ring-red-500/50',
        isCircuitBreaker && 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-[#2a1a1a]',
        !isConflicted && !isCircuitBreaker && (canEdit ? 'border-zinc-800 hover:border-zinc-700' : 'border-zinc-800'),
      )}>

        {/* ── ROW 1: ICON ｜ 標題 ｜ 導航按鈕 ── */}
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <div
            className="shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: `${isCircuitBreaker ? '#ef4444' : (category as any).color}18`,
              color: isCircuitBreaker ? '#ef4444' : (category as any).color,
            }}
          >
            <DynamicIcon name={item.icon || 'MapPin'} size={18} />
          </div>

          <div className="flex-1 min-w-0 cursor-pointer" onClick={handleTitleClick}>
            <h4 className={clsx('text-[17px] font-black leading-tight truncate', isPast ? 'text-zinc-600' : 'text-white')}>
              {item.title}
            </h4>
            {item.start_time && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={clsx('font-mono text-[11px] font-bold tracking-tight', isPast ? 'text-zinc-600' : 'text-zinc-400')}>
                  {item.start_time}{item.end_time && item.end_time !== item.start_time ? ` — ${item.end_time}` : ''}
                </span>
                {!(item as any).is_time_fixed && !isPast && <Sparkles size={9} className="text-orange-500/60" />}
              </div>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapsLink(), '_blank'); }}
            className="shrink-0 p-2 rounded-xl text-zinc-600 hover:text-orange-500 transition-colors active:scale-90"
          >
            <Navigation2 size={15} />
          </button>
        </div>

        {/* ── 展開內容區 ── */}
        <AnimatePresence initial={false}>
          {isExpanded && canExpand && (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                {subItemIdx !== null ? (

                  /* ── 子活動詳情 ── */
                  <motion.div
                    key={`sub-${subItemIdx}`}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mx-3 mb-3 bg-zinc-900/50 rounded-[20px] border border-zinc-800/50 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setSubItemIdx(null)}
                      className="flex items-center gap-1.5 px-4 pt-3 pb-2 text-orange-400 text-[11px] font-black tracking-wide"
                    >
                      <ChevronLeft size={13} strokeWidth={3} />返回
                    </button>
                    {(() => {
                      const sub = subItems[subItemIdx];
                      if (!sub) return null;
                      return (
                        <div className="px-4 pb-4 space-y-3">
                          {sub.start_time && (
                            <div className="font-mono text-[10px] text-zinc-500">
                              {sub.start_time}{sub.end_time && sub.end_time !== sub.start_time ? ` — ${sub.end_time}` : ''}
                            </div>
                          )}
                          <h5 className="text-[16px] font-black text-white">{sub.title}</h5>
                          {sub.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {sub.tags.map((t: string) => (
                                <span key={t} className="text-[9px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-lg border border-orange-400/20">#{t}</span>
                              ))}
                            </div>
                          )}
                          {sub.notes ? (
                            <div className="bg-white/5 rounded-2xl p-3 border border-white/8">
                              <p className="text-[12px] text-zinc-300 leading-relaxed italic whitespace-pre-wrap">{sub.notes}</p>
                            </div>
                          ) : (
                            <p className="text-[12px] text-zinc-600 italic">沒有備註</p>
                          )}
                        </div>
                      );
                    })()}
                  </motion.div>

                ) : hasPhoto && !hasContent ? (

                  /* ── 僅有照片 ── */
                  <motion.div
                    key="photo-only"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mx-3 mb-3 rounded-[20px] overflow-hidden"
                  >
                    <img
                      src={item.image_url!}
                      alt={item.title}
                      className={clsx('w-full aspect-[21/9] object-cover block', isPast ? 'opacity-30' : 'opacity-90')}
                    />
                  </motion.div>

                ) : hasPhoto && hasContent ? (

                  /* ── 照片 + 遮罩 + 內容 ── */
                  <motion.div
                    key="photo-content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mx-3 mb-3 rounded-[20px] overflow-hidden"
                  >
                    <div className="relative">
                      <img
                        src={item.image_url!}
                        alt={item.title}
                        className={clsx('w-full object-cover block', isPast ? 'opacity-25' : 'opacity-80')}
                        style={{ height: '120px', objectPosition: 'center' }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1e] via-[#1c1c1e]/50 to-transparent" />
                    </div>
                    <div className="bg-[#1c1c1e] px-4 pb-4 pt-1">
                      {renderContent()}
                    </div>
                  </motion.div>

                ) : (

                  /* ── 僅有內容（無照片）── */
                  <motion.div
                    key="content-only"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mx-3 mb-3 bg-zinc-900/40 rounded-[20px] border border-zinc-800/40 px-4 py-4"
                  >
                    {renderContent()}
                  </motion.div>

                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 下一站 ── */}
        {showNextTransport && (canEdit || !!item.next_transport_mode) && (
          <div className={clsx(
            'border-t',
            isCircuitBreaker ? 'border-red-500/30' : 'border-zinc-800/60',
          )}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={(e) => { e.stopPropagation(); if (canEdit && onEditNextTransport) onEditNextTransport(); }}
              className={clsx(
                'w-full px-4 py-3 flex items-center justify-between transition-colors',
                canEdit ? 'cursor-pointer hover:bg-zinc-800/30 active:bg-zinc-800/50' : 'cursor-default',
                isCircuitBreaker && 'bg-red-500/10',
              )}
            >
              <span className={clsx('text-[9px] font-black uppercase tracking-[0.2em]', isCircuitBreaker ? 'text-red-400' : 'text-zinc-500')}>
                下一站
              </span>

              {item.next_transport_mode ? (
                <div className="flex items-center gap-2 text-orange-500">
                  {getTransportIcon()}
                  <span className="text-[11px] font-black tracking-tight flex items-center gap-1">
                    {manualVal > 0 ? `${manualVal}分` : autoVal > 0 ? <>{autoVal}分 <Sparkles size={9} /></> : '自動'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-zinc-600">
                  <Plus size={12} />
                  <span className="text-[9px] font-bold">設定交通</span>
                </div>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
