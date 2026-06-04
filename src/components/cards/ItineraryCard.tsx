import React, { useState, useEffect } from 'react';
import { Car, Train, Bus, AlertTriangle, Star, Plus, Footprints, Bike, Navigation2, Sparkles, Clock, Asterisk, LayoutList, X, ChevronLeft } from 'lucide-react';
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

// overlayState: null = 正常, 'list' = 詳情遮罩(列表), number = 子活動詳情
type OverlayState = null | 'list' | number;

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

  const [isExpanded,   setIsExpanded]   = useState(!isPast && !!item.image_url);
  const [overlayState, setOverlayState] = useState<OverlayState>(null);

  const closedWarning    = checkIsClosed(item.date, item.opening_hours);
  const hasWarning       = !!closedWarning || !!item.sync_conflict_warning || !!isConflicted;
  const isCircuitBreaker = canEdit && !!item.start_time && (!item.next_transport_mode || item.next_transport_mode === '');

  // 是否有詳情可看（決定是否顯示 detail 按鈕）
  const hasOverlayContent = item.rating || subItems.length > 0 || tags.length > 0 || !!item.notes || hasWarning;

  useEffect(() => { if (expandSignal  && expandSignal  > 0 && item.image_url) setIsExpanded(true);  }, [expandSignal,  item.image_url]);
  useEffect(() => { if (collapseSignal && collapseSignal > 0) { setIsExpanded(false); setOverlayState(null); } }, [collapseSignal]);

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

  const handleDetailBtn = () => {
    setOverlayState(prev => (prev === null ? 'list' : null));
  };

  return (
    <div className={clsx('flex flex-col w-full mb-3 px-1 transition-all', isDragOverlay && 'opacity-90 scale-105 shadow-2xl z-50')}>
      <div className={clsx(
        'relative flex flex-col bg-[#1c1c1e] rounded-[32px] overflow-hidden border transition-all',
        isConflicted     && 'border-red-500 ring-2 ring-red-500/50',
        isCircuitBreaker && 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-[#2a1a1a]',
        !isConflicted && !isCircuitBreaker && (canEdit ? 'border-zinc-800 hover:border-zinc-700' : 'border-zinc-800'),
      )}>

        {/* ══ ROW 1: ICON ｜ 標題 ｜ 導航按鈕 ════════════════════════════ */}
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

          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => canEdit ? onEdit() : (item.image_url && setIsExpanded(v => !v))}
          >
            <h4 className={clsx('text-[17px] font-black leading-tight truncate', isPast ? 'text-zinc-600' : 'text-white')}>
              {item.title}
            </h4>
            {item.start_time && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={clsx('font-mono text-[11px] font-bold tracking-tight', isPast ? 'text-zinc-600' : 'text-zinc-400')}>
                  {item.start_time}{item.end_time && item.end_time !== item.start_time ? ` — ${item.end_time}` : ''}
                </span>
                {!item.is_time_fixed && !isPast && <Sparkles size={9} className="text-orange-500/60" />}
              </div>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapsLink(), '_blank'); }}
            className="shrink-0 p-2 bg-zinc-800/40 rounded-xl text-zinc-400 hover:text-orange-500 transition-all border border-white/5 active:scale-90"
          >
            <Navigation2 size={14} />
          </button>
        </div>

        {/* ══ 內容區：照片 or 詳情遮罩 ══════════════════════════════════ */}
        <AnimatePresence mode="wait" initial={false}>
          {overlayState !== null ? (

            /* ── 詳情遮罩 ─────────────────────────────────────────────── */
            <motion.div
              key="overlay"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="flex flex-col bg-black/90 backdrop-blur-xl"
            >
              {overlayState === 'list' ? (
                /* ── 列表模式 ──────────────────────────────────────────── */
                <div className="p-4 space-y-4 min-h-[160px]">
                  {/* 評分 + Tags */}
                  {(item.rating || tags.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {item.rating && (
                        <div className="flex items-center gap-1.5 bg-yellow-500/15 border border-yellow-500/25 rounded-xl px-3 py-1.5">
                          <Star size={13} className="text-yellow-400 fill-yellow-400" />
                          <span className="text-[13px] font-black text-yellow-300">{(item.rating as number).toFixed(1)}</span>
                          {(item as any).reviews_count && (
                            <span className="text-[10px] text-yellow-500/70 font-medium">({(item as any).reviews_count.toLocaleString()})</span>
                          )}
                        </div>
                      )}
                      {tags.map((t: string) => (
                        <span key={t} className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-xl border border-orange-500/20">#{t}</span>
                      ))}
                    </div>
                  )}

                  {/* 子活動列表 */}
                  {subItems.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] px-1">子活動</div>
                      {subItems.map((sub: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setOverlayState(idx)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-2xl transition-all text-left group"
                        >
                          <span className="font-mono text-[10px] text-zinc-500 shrink-0 w-[68px]">
                            {sub.start_time}{sub.end_time && sub.end_time !== sub.start_time ? `–${sub.end_time}` : ''}
                          </span>
                          <span className="flex-1 text-[13px] font-bold text-zinc-200 truncate">{sub.title}</span>
                          {(sub.notes || sub.tags?.length > 0) && (
                            <Asterisk size={12} strokeWidth={3} className="shrink-0 text-zinc-600 group-hover:text-orange-400 transition-colors" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 主備註 + 警告 */}
                  {(item.notes || hasWarning) && (
                    <div className="space-y-1.5 px-1">
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
                        <p className="text-[12px] text-zinc-400 leading-relaxed italic whitespace-pre-wrap">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>

              ) : (
                /* ── 子活動詳情模式 ─────────────────────────────────────── */
                <div className="flex flex-col min-h-[160px]">
                  {/* 返回列表 */}
                  <button
                    type="button"
                    onClick={() => setOverlayState('list')}
                    className="flex items-center gap-2 px-4 pt-3 pb-1 text-orange-400 text-[11px] font-black uppercase tracking-widest"
                  >
                    <ChevronLeft size={14} strokeWidth={3} />返回
                  </button>

                  {(() => {
                    const sub = subItems[overlayState as number];
                    if (!sub) return null;
                    return (
                      <div className="px-4 pb-4 space-y-3">
                        {/* 時間 + 標題 */}
                        <div>
                          <div className="text-[10px] font-mono text-zinc-500 mb-1">
                            {sub.start_time}{sub.end_time && sub.end_time !== sub.start_time ? ` — ${sub.end_time}` : ''}
                          </div>
                          <h5 className="text-[16px] font-black text-white leading-tight">{sub.title}</h5>
                        </div>

                        {/* Tags */}
                        {sub.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {sub.tags.map((t: string) => (
                              <span key={t} className="text-[9px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-lg border border-orange-400/20">#{t}</span>
                            ))}
                          </div>
                        )}

                        {/* 備註 */}
                        {sub.notes ? (
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/8">
                            <p className="text-[13px] text-zinc-300 leading-relaxed italic whitespace-pre-wrap">{sub.notes}</p>
                          </div>
                        ) : (
                          <p className="text-[12px] text-zinc-600 italic">沒有備註</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </motion.div>

          ) : (

            /* ── 正常模式：照片 + 細節 ─────────────────────────────────── */
            <motion.div
              key="normal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* 照片 */}
              <AnimatePresence initial={false}>
                {item.image_url && isExpanded && (
                  <motion.div
                    key="photo"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: 'easeInOut' }}
                  >
                    <div className="mx-3 mb-3 rounded-[20px] overflow-hidden">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className={clsx('w-full aspect-[21/9] object-cover', isPast ? 'opacity-30' : 'opacity-90')}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 有圖但收起 → 細線提示 */}
              {item.image_url && !isExpanded && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="mx-4 mb-3 h-1 rounded-full bg-zinc-800 hover:bg-orange-500/30 transition-colors"
                />
              )}
            </motion.div>

          )}
        </AnimatePresence>

        {/* ══ ROW 3: [詳情按鈕] ｜ NEXT STOP ｜ 交通資訊 ════════════════ */}
        <div className={clsx(
          'flex items-stretch border-t',
          isCircuitBreaker ? 'border-red-500/30' : 'border-zinc-800/60',
        )}>

          {/* 詳情按鈕（有內容才顯示） */}
          {hasOverlayContent && (
            <button
              type="button"
              onClick={handleDetailBtn}
              className={clsx(
                'px-4 flex items-center justify-center border-r transition-all',
                isCircuitBreaker ? 'border-red-500/30' : 'border-zinc-800/60',
                overlayState !== null
                  ? 'text-orange-500 bg-orange-500/10'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800/40',
              )}
            >
              {overlayState !== null
                ? <X size={15} strokeWidth={2.5} />
                : <LayoutList size={15} strokeWidth={2} />
              }
            </button>
          )}

          {/* Next Stop */}
          {showNextTransport && (canEdit || !!item.next_transport_mode) && (
            <button
              type="button"
              disabled={!canEdit}
              onClick={(e) => { e.stopPropagation(); if (canEdit && onEditNextTransport) onEditNextTransport(); }}
              className={clsx(
                'flex-1 px-4 py-3 flex items-center justify-between transition-colors',
                canEdit ? 'cursor-pointer hover:bg-zinc-800/30' : 'cursor-default',
                isCircuitBreaker && 'bg-red-500/10',
              )}
            >
              <span className={clsx('text-[9px] font-black uppercase tracking-[0.2em]', isCircuitBreaker ? 'text-red-400' : 'text-zinc-500')}>
                Next Stop
              </span>

              {item.next_transport_mode ? (
                <div className="flex items-center gap-2 text-orange-500">
                  {getTransportIcon()}
                  <span className="text-[11px] font-black tracking-tight flex items-center gap-1">
                    {manualVal > 0 ? `${manualVal}m` : autoVal > 0 ? <>{autoVal}m <Sparkles size={9} /></> : 'Auto'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-zinc-600">
                  <Plus size={12} />
                  <span className="text-[9px] font-bold uppercase">設定交通</span>
                </div>
              )}
            </button>
          )}

          {/* 沒有 Next Stop 的情況只有詳情按鈕時補白 */}
          {(!showNextTransport || (!canEdit && !item.next_transport_mode)) && !hasOverlayContent && (
            <div className="h-px" />
          )}
        </div>

      </div>
    </div>
  );
}
