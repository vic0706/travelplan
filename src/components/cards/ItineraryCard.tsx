import React, { useState, useEffect, useRef } from 'react';
import { Car, Train, Bus, AlertTriangle, Star, Plus, Footprints, Bike, Navigation2, Sparkles, Clock, Asterisk, ChevronLeft, ChevronRight, ChevronDown, Motorbike, Copy, CalendarDays, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary } from '../../types';
import { DynamicIcon } from '../common/DynamicIcon';
import { useAppStore } from '../../store';
import { clsx } from 'clsx';

interface ItineraryCardProps {
  item: Itinerary;
  nextItem?: Itinerary;
  canEdit?: boolean;
  isConflicted?: boolean;
  onEdit: () => void;
  showNextTransport?: boolean;
  onEditNextTransport?: () => void;
  expandSignal?: number;
  collapseSignal?: number;
  isDragOverlay?: boolean;
  onCopy?: () => void;
  onChangeDate?: () => void;
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
  item, nextItem, canEdit, isConflicted, onEdit, showNextTransport, onEditNextTransport,
  expandSignal, collapseSignal, isDragOverlay, onCopy, onChangeDate,
}: ItineraryCardProps) {
  const { categories } = useAppStore();
  const category = (categories || []).find((c: any) => c.icon === item.icon) || { color: '#808080' };

  const tags     = safeParse(item.tags);
  const subItems = safeParse(item.sub_items);

  const endTimeStr = item.end_time || item.start_time || '23:59';
  const isPast = Date.now() > new Date(`${item.date}T${endTimeStr}`).getTime();

  const closedWarning    = checkIsClosed(item.date, item.opening_hours);
  const hasWarning       = !!closedWarning || !!item.sync_conflict_warning || !!isConflicted;
  const isCircuitBreaker = canEdit && !!showNextTransport && !!item.start_time && (!item.next_transport_mode || item.next_transport_mode === '');

  const hasContent = !!item.rating || subItems.length > 0 || tags.length > 0 || !!item.notes || hasWarning;
  const hasPhoto   = !!item.image_url;
  const canExpand  = hasPhoto || hasContent;

  const [isExpanded,     setIsExpanded]     = useState(!isPast && hasPhoto);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [subItemIdx,     setSubItemIdx]     = useState<number | null>(null);

  const overlayScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkOverlayScroll = () => {
    const el = overlayScrollRef.current;
    if (!el) { setCanScrollDown(false); return; }
    setCanScrollDown(el.scrollHeight - el.scrollTop > el.clientHeight + 4);
  };

  useEffect(() => {
    if (overlayVisible) { setTimeout(checkOverlayScroll, 60); }
    else setCanScrollDown(false);
  }, [overlayVisible, subItemIdx]);

  const detailParts: string[] = [
    item.notes ? '備注' : '',
    tags.length > 0 ? '標籤' : '',
    subItems.length > 0 ? '子活動' : '',
    hasWarning ? '⚠' : '',
  ].filter(Boolean) as string[];
  const detailLabel = detailParts.length > 0 ? detailParts.join(' · ') : '詳情';

  useEffect(() => {
    if (expandSignal && expandSignal > 0 && hasPhoto) setIsExpanded(true);
  }, [expandSignal, hasPhoto]);

  useEffect(() => {
    if (collapseSignal && collapseSignal > 0) {
      setIsExpanded(false); setOverlayVisible(false); setSubItemIdx(null);
    }
  }, [collapseSignal]);

  const openGoogleMaps = () => {
    let url: string;
    if ((item as any).google_place_id) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.title)}&destination_place_id=${(item as any).google_place_id}`;
    } else if (item.lat && item.lng) {
      url = `https://maps.google.com/maps?daddr=${encodeURIComponent(item.title)}@${item.lat},${item.lng}`;
    } else {
      const dest = encodeURIComponent(item.address || item.title);
      url = `https://maps.google.com/maps?daddr=${dest}`;
    }
    // window.open is blocked in iOS PWA standalone mode; use location redirect via anchor
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Use the optimizer-resolved mode (when AUTO) or the user-set mode
  const displayMode = (item.next_transport_resolved_mode || item.next_transport_mode || '').toLowerCase();
  const isAutoUnresolved = (item.next_transport_mode || '').toUpperCase() === 'AUTO' && !item.next_transport_resolved_mode;

  const getTransportIcon = (size = 14) => {
    if (isAutoUnresolved) return <Sparkles size={size} />;
    switch (displayMode) {
      case 'transit': case 'train': return <Train size={size} />;
      case 'bus':          return <Bus size={size} />;
      case 'walking':      return <Footprints size={size} />;
      case 'bicycling':    return <Bike size={size} />;
      case 'motorcycling': return <Motorbike size={size} />;
      default:             return <Car size={size} />;
    }
  };

  const manualVal = parseInt(item.next_transport_time?.toString().replace(/\D/g, '') || '0', 10);
  const autoVal   = Math.round(Number((item as any).next_transport_auto_time || 0));

  const handleTitleClick = () => {
    if (canEdit) { onEdit(); return; }
    if (!canExpand) return;
    if (isExpanded) {
      setIsExpanded(false);
      setOverlayVisible(false);
      setSubItemIdx(null);
    } else {
      setIsExpanded(true);
    }
  };

  const handleDetailBtn = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      setOverlayVisible(true);
    } else {
      setOverlayVisible(v => !v);
      setSubItemIdx(null);
    }
  };

  const renderOverlayContent = () => {
    if (subItemIdx !== null) {
      const sub = subItems[subItemIdx];
      if (!sub) return null;
      const subNavUrl = (sub.lat && sub.lng)
        ? `https://maps.google.com/maps?daddr=${encodeURIComponent(sub.title || '')}@${sub.lat},${sub.lng}`
        : sub.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sub.address)}`
        : null;
      return (
        <div>
          <button
            type="button"
            onClick={() => setSubItemIdx(null)}
            className="w-full flex items-center gap-2 bg-white/5 active:bg-white/10 rounded-xl px-3 py-2.5 mb-3 text-orange-400 transition-colors"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
            <span className="text-[11px] font-black tracking-wide">返回</span>
          </button>
          {sub.start_time && !!(item as any).is_time_fixed && (
            <div className="font-mono text-[9px] text-zinc-500 mb-1">
              {sub.start_time}{sub.end_time && sub.end_time !== sub.start_time ? ` — ${sub.end_time}` : ''}
            </div>
          )}
          <h5 className="text-[13px] font-black text-white mb-1">{sub.title}</h5>
          {sub.duration > 0 && (
            <div className="text-[9px] text-orange-400/70 mb-2">{sub.duration} 分鐘</div>
          )}
          {sub.address && (
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin size={10} className="text-zinc-500 shrink-0" />
              <span className="text-[11px] text-zinc-400 flex-1 leading-tight">{sub.address}</span>
              {subNavUrl && (
                <a
                  href={subNavUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                >
                  <Navigation2 size={12} />
                </a>
              )}
            </div>
          )}
          {sub.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {sub.tags.map((t: string) => (
                <span key={t} className="text-[8px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-md border border-orange-400/20">#{t}</span>
              ))}
            </div>
          )}
          {sub.notes
            ? <p className="text-[11px] text-zinc-300 leading-relaxed italic">{sub.notes}</p>
            : <p className="text-[10px] text-zinc-600 italic">沒有備註</p>
          }
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t: string) => (
              <span key={t} className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-md border border-orange-500/20">#{t}</span>
            ))}
          </div>
        )}

        {/* 子活動 */}
        {subItems.length > 0 && (
          <div className="space-y-1">
            <div className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.15em]">子活動</div>
            {subItems.map((sub: any, idx: number) => {
              const subHasDetails = !!sub.notes;
              const showTime = !!sub.start_time;
              const subNavUrl = (sub.lat && sub.lng)
                ? `https://maps.google.com/maps?daddr=${encodeURIComponent(sub.title || '')}@${sub.lat},${sub.lng}`
                : sub.address
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sub.address)}`
                : null;
              return (
                <div
                  key={idx}
                  onClick={subHasDetails ? (e) => { e.stopPropagation(); setSubItemIdx(idx); } : undefined}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-3 bg-white/5 border border-white/10 rounded-xl relative overflow-hidden transition-colors",
                    subHasDetails ? "active:bg-white/10 cursor-pointer" : "cursor-default"
                  )}
                >
                  {/* Left accent */}
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500/50 rounded-r-full" />
                  <div className="flex-1 min-w-0 pl-0.5">
                    <div className="text-[13px] font-bold text-white truncate">{sub.title}</div>
                    {showTime && (
                      <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                        {sub.start_time}{sub.end_time && sub.end_time !== sub.start_time ? ` — ${sub.end_time}` : ''}
                      </div>
                    )}
                    {Array.isArray(sub.tags) && (sub.tags as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(sub.tags as string[]).map((t: string) => (
                          <span key={t} className="text-[8px] font-bold text-orange-400/70 bg-orange-400/10 px-1 py-0.5 rounded border border-orange-400/15">#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {subNavUrl && (
                      <a
                        href={subNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-orange-400 active:bg-white/10 transition-colors"
                      >
                        <Navigation2 size={13} />
                      </a>
                    )}
                    {subHasDetails && (
                      <>
                        <Asterisk size={9} strokeWidth={3} className="text-zinc-600" />
                        <ChevronRight size={11} className="text-zinc-700" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* AI 評論摘要 */}
        {item.review_summary && (
          <div className="text-[10px] text-zinc-400 leading-relaxed italic border-l-2 border-zinc-700 pl-2">
            {item.review_summary}
          </div>
        )}

        {/* 警告 + 備註 */}
        {(hasWarning || item.notes) && (
          <div className="space-y-1.5">
            {isConflicted && (
              <div className="flex items-center gap-1 text-red-400 text-[10px] font-bold">
                <AlertTriangle size={10} />行程時間衝突
              </div>
            )}
            {closedWarning && (
              <div className="flex items-center gap-1 text-red-400 text-[10px] font-bold">
                <Clock size={10} />⚠️ {closedWarning}
              </div>
            )}
            {item.sync_conflict_warning && !closedWarning && (
              <div className="flex items-center gap-1 text-orange-400 text-[10px] font-bold">
                <AlertTriangle size={10} />{item.sync_conflict_warning}
              </div>
            )}
            {item.notes && (
              <p className="text-[11px] text-zinc-300 leading-relaxed italic whitespace-pre-wrap">{item.notes}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderBottomBar = (onPhoto: boolean) => {
    const hasBar = hasContent || (showNextTransport && (canEdit || !!item.next_transport_mode));
    if (!hasBar) return null;
    if (onPhoto) {
      return (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-2 bg-black/50 backdrop-blur-[8px] border-t border-white/5">
          {hasContent ? (
            <button type="button" onClick={handleDetailBtn}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded-lg transition-all',
                overlayVisible ? 'text-orange-400 bg-orange-500/10' : 'text-white/55 hover:text-white/80')}>
              <span className="text-[9px] font-black tracking-wider">{detailLabel}</span>
            </button>
          ) : <div />}
          {showNextTransport && (canEdit || !!item.next_transport_mode) && (
            <button type="button" disabled={!canEdit}
              onClick={(e) => { e.stopPropagation(); if (canEdit && onEditNextTransport) onEditNextTransport(); }}
              className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors',
                canEdit ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : 'cursor-default')}>
              {item.next_transport_mode ? (
                <div className="flex items-center gap-1 text-zinc-400">
                  {getTransportIcon(12)}
                  <span className="text-[10px] font-black tracking-tight flex items-center gap-0.5">
                    {manualVal > 0 ? `${manualVal}分` : autoVal > 0 ? <>{autoVal}分 <Sparkles size={9} /></> : '自動'}
                  </span>
                  {nextItem && (
                    <span className="text-[9px] text-white/30 font-bold truncate max-w-[60px]">→ {nextItem.title}</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-0.5 text-white/30">
                  <Plus size={10} /><span className="text-[9px] font-bold">設定交通</span>
                </div>
              )}
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        {hasContent ? (
          <button type="button" onClick={handleDetailBtn}
            className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all',
              overlayVisible ? 'text-orange-500 bg-orange-500/8' : 'text-zinc-600 hover:text-zinc-400')}>
            <span className="text-[9px] font-black tracking-wider">{detailLabel}</span>
          </button>
        ) : <div />}
        {showNextTransport && (canEdit || !!item.next_transport_mode) && (
          <button type="button" disabled={!canEdit}
            onClick={(e) => { e.stopPropagation(); if (canEdit && onEditNextTransport) onEditNextTransport(); }}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors',
              canEdit ? 'cursor-pointer hover:bg-zinc-800/30 active:bg-zinc-800/50' : 'cursor-default')}>
            {item.next_transport_mode ? (
              <div className="flex items-center gap-1.5 text-zinc-400">
                {getTransportIcon()}
                <span className="text-[11px] font-black tracking-tight flex items-center gap-1">
                  {manualVal > 0 ? `${manualVal}分` : autoVal > 0 ? <>{autoVal}分 <Sparkles size={9} /></> : '自動'}
                </span>
                {nextItem && (
                  <span className="text-[10px] text-zinc-600 font-bold truncate max-w-[80px]">→ {nextItem.title}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-zinc-600">
                <Plus size={11} /><span className="text-[9px] font-bold">設定交通</span>
              </div>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={clsx('flex flex-col w-full mb-3 px-1 transition-all', isDragOverlay && 'opacity-90 scale-105 shadow-2xl z-50')}>
      <div className={clsx(
        'relative flex flex-col bg-[#1c1c1e] rounded-[32px] overflow-hidden border transition-all',
        isConflicted     && 'border-red-500 ring-2 ring-red-500/50',
        isCircuitBreaker && 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-[#2a1a1a]',
        !isConflicted && !isCircuitBreaker && (canEdit ? 'border-zinc-800 hover:border-zinc-700' : 'border-zinc-800'),
      )}>

        {/* ── ROW 1: ICON ｜ 標題 ｜ 導航 ── */}
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
                {isCircuitBreaker && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
              </div>
            )}
            {/* Warning summary — visible without expanding */}
            {(isConflicted || isCircuitBreaker || closedWarning || item.sync_conflict_warning) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5">
                {isConflicted && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400">
                    <AlertTriangle size={9} />行程時間重疊
                  </span>
                )}
                {isCircuitBreaker && !isConflicted && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400">
                    <AlertTriangle size={9} />尚未設定交通方式
                  </span>
                )}
                {closedWarning && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-yellow-500">
                    <Clock size={9} />{closedWarning}
                  </span>
                )}
                {item.sync_conflict_warning && !closedWarning && !isConflicted && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-400">
                    <AlertTriangle size={9} />{item.sync_conflict_warning}
                  </span>
                )}
              </div>
            )}
          </div>

          {item.rating && (
            <div className="shrink-0 flex items-center gap-0.5 bg-yellow-500/15 rounded-lg px-1.5 py-0.5">
              <Star size={9} className="text-yellow-400 fill-yellow-400" />
              <span className="text-[10px] font-black text-yellow-300">{(item.rating as number).toFixed(1)}</span>
            </div>
          )}

          {canEdit && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onCopy?.(); }}
                className="shrink-0 p-2 rounded-xl text-zinc-600 hover:text-orange-500 transition-colors active:scale-90"
                title="複製活動"
              >
                <Copy size={15} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onChangeDate?.(); }}
                className="shrink-0 p-2 rounded-xl text-zinc-600 hover:text-orange-500 transition-colors active:scale-90"
                title="更改日期"
              >
                <CalendarDays size={15} />
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); openGoogleMaps(); }}
            className="shrink-0 p-2 rounded-xl text-zinc-600 hover:text-orange-500 transition-colors active:scale-90"
          >
            <Navigation2 size={15} />
          </button>
        </div>

        {/* ── 展開區域（照片延伸到卡片底部，底部列懸浮其上） ── */}
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
              <div className="relative" style={{ height: 197 }}>
                {/* 背景：照片或深色底 */}
                {hasPhoto ? (
                  <img
                    src={item.image_url!}
                    alt={item.title}
                    onClick={canEdit ? () => onEdit() : undefined}
                    className={clsx('absolute inset-0 w-full h-full object-cover', canEdit && 'cursor-pointer', isPast ? 'opacity-25' : 'opacity-85')}
                  />
                ) : (
                  <div
                    className={clsx('absolute inset-0 bg-zinc-900/70', canEdit && 'cursor-pointer')}
                    onClick={canEdit ? () => onEdit() : undefined}
                  />
                )}

                {/* 內容遮罩 - z-10，底部留出底部列空間 */}
                <AnimatePresence>
                  {overlayVisible && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 z-10 bg-black/88 backdrop-blur-md"
                    >
                      <div
                        ref={overlayScrollRef}
                        onScroll={checkOverlayScroll}
                        onClick={canEdit ? () => onEdit() : undefined}
                        className="absolute inset-0 overflow-y-auto no-scrollbar p-3 pb-11"
                      >
                        {renderOverlayContent()}
                      </div>
                      {canScrollDown && (
                        <div className="absolute bottom-9 left-0 right-0 h-6 bg-gradient-to-t from-black/70 to-transparent pointer-events-none flex items-end justify-center pb-0.5">
                          <ChevronDown size={11} className="text-white/50 animate-bounce" />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 底部列 - 懸浮在照片上，z-20 */}
                {renderBottomBar(true)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 底部列 - 未展開時顯示於卡片下方 */}
        {!isExpanded && renderBottomBar(false)}

      </div>
    </div>
  );
}
