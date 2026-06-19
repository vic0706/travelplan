import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Car, Train, Bus, AlertTriangle, Star, Plus, Footprints, Bike, Navigation2, Sparkles, Clock, Asterisk, ChevronLeft, ChevronRight, ChevronDown, Motorbike, Copy, CalendarDays, MapPin, Lock, LockOpen, GripVertical } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary } from '../../types';
import { DynamicIcon } from '../common/DynamicIcon';
import { useAppStore } from '../../store';
import { clsx } from 'clsx';
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  defaultSignal?: number;
  expandState?: 'default' | 'expanded' | 'collapsed';
  isDragOverlay?: boolean;
  onCopy?: () => void;
  onChangeDate?: () => void;
  onToggleLock?: () => void;
  dragHandleListeners?: Record<string, unknown>;
  // 備案導航
  cardIndex?: number;
  totalCards?: number;
  onPrevCard?: () => void;
  onNextCard?: () => void;
  isBackup?: boolean;
  onSwapToMain?: () => void;
  onAddBackup?: () => void;
}

const formatDuration = (mins: number) => {
  if (mins < 60) return `${mins}分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}時` : `${h}時${m}分`;
};

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

const walkEstimate = (from: any, to: any): number | null => {
  if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) return null;
  const R = 6371;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return Math.ceil(dist * 1.3 * 13) + 3;
};

// ── Sub-item drag components ──────────────────────────────────────────────────

interface SortableSubItemProps {
  sub: any;
  idx: number;
  nextSub?: any;
  walkOverrides: Record<number, number>;
  onSelect: (idx: number) => void;
  isLast: boolean;
}

function SortableSubItem({ sub, idx, nextSub, walkOverrides, onSelect, isLast }: SortableSubItemProps) {
  const subHasDetails = !!sub.notes;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const walkMins = walkOverrides[sub.id] !== undefined ? walkOverrides[sub.id] : (sub.next_walk_mins || 0);
  const est = !isLast ? walkEstimate(sub, nextSub) : null;
  const displayWalk = walkMins > 0
    ? { mins: walkMins, isEstimate: false }
    : est !== null
      ? { mins: est, isEstimate: true }
      : null;

  const subNavUrl = (sub.lat && sub.lng)
    ? `https://maps.google.com/maps?daddr=${encodeURIComponent(sub.title || '')}@${sub.lat},${sub.lng}`
    : sub.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sub.address)}`
    : null;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        onClick={subHasDetails ? (e) => { e.stopPropagation(); onSelect(idx); } : undefined}
        className={clsx(
          "w-full flex flex-col px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl relative overflow-hidden transition-colors",
          subHasDetails ? "active:bg-white/10 cursor-pointer" : "cursor-default"
        )}
      >
        {/* Left accent */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500/50 rounded-r-full" />
        {/* Main row */}
        <div className="flex items-center gap-2 pl-0.5">
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="shrink-0 text-zinc-700 hover:text-zinc-500 cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={13} />
          </div>
          <div className="flex-1 min-w-0">
            {!!sub.start_time && (
              <div className="font-mono text-[10px] text-zinc-500 mb-0.5">
                {sub.start_time}{sub.end_time && sub.end_time !== sub.start_time ? ` — ${sub.end_time}` : ''}
              </div>
            )}
            <div className="text-[13px] font-bold text-white truncate">{sub.title}</div>
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
        {!isLast && displayWalk && (
          <div className="flex items-center justify-end gap-0.5 mt-1.5">
            <span className="text-[7px] text-zinc-600 font-bold leading-none">下一站</span>
            <span className={clsx('flex items-center gap-0.5', displayWalk.isEstimate ? 'text-zinc-700' : 'text-zinc-500')}>
              <Footprints size={8} />
              <span className="text-[8px] font-mono leading-none">
                {displayWalk.isEstimate && '~'}{formatDuration(displayWalk.mins)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface SubItemsListProps {
  items: any[];
  walkOverrides: Record<number, number>;
  onReorder: (newItems: any[]) => void;
  onSelectItem: (idx: number) => void;
}

function SubItemsList({ items, walkOverrides, onReorder, onSelectItem }: SubItemsListProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((s: any) => s.id === active.id);
    const newIdx = items.findIndex((s: any) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onReorder(arrayMove(items, oldIdx, newIdx));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((s: any) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {items.map((sub: any, idx: number) => (
            <SortableSubItem
              key={sub.id}
              sub={sub}
              idx={idx}
              nextSub={items[idx + 1]}
              walkOverrides={walkOverrides}
              onSelect={onSelectItem}
              isLast={idx === items.length - 1}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ItineraryCard({
  item, nextItem, canEdit, isConflicted, onEdit, showNextTransport, onEditNextTransport,
  expandSignal, collapseSignal, defaultSignal, expandState, isDragOverlay, onCopy, onChangeDate,
  onToggleLock, dragHandleListeners,
  cardIndex, totalCards, onPrevCard, onNextCard, isBackup, onSwapToMain, onAddBackup,
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

  const getInitialExpanded = () => {
    if (expandState === 'expanded') return canExpand;
    if (expandState === 'collapsed') return false;
    return !isPast && hasPhoto;
  };
  const [isExpanded,     setIsExpanded]     = useState(getInitialExpanded);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [subItemIdx,     setSubItemIdx]     = useState<number | null>(null);
  const [walkOverrides,  setWalkOverrides]  = useState<Record<number, number>>({});
  const [localSubItems,  setLocalSubItems]  = useState<any[]>(() => safeParse(item.sub_items));
  const fetchedWalkRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (subItems.length < 2) return;
    subItems.forEach((sub: any, idx: number) => {
      if (idx >= subItems.length - 1) return;
      const nextSub = subItems[idx + 1];
      if ((sub.next_walk_mins ?? 0) > 0) return;
      if (fetchedWalkRef.current.has(sub.id)) return;
      if (!sub.lat || !sub.lng || !nextSub.lat || !nextSub.lng) return;
      fetchedWalkRef.current.add(sub.id);
      apiFetch(`/api/walking-time?fromLat=${sub.lat}&fromLng=${sub.lng}&toLat=${nextSub.lat}&toLng=${nextSub.lng}`)
        .then(r => r.json())
        .then((d: any) => {
          if (d.minutes && d.minutes > 0) {
            setWalkOverrides(prev => ({ ...prev, [sub.id]: d.minutes }));
            apiFetch(
              `/api/trips/${item.trip_id}/itineraries/${item.id}/sub-items/${sub.id}`,
              { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...sub, next_walk_mins: d.minutes,
                  tags: Array.isArray(sub.tags) ? JSON.stringify(sub.tags) : (sub.tags ?? '[]') }) }
            ).catch(() => {});
          }
        })
        .catch(() => {});
    });
  }, [subItems]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (defaultSignal && defaultSignal > 0) {
      setIsExpanded(!isPast && hasPhoto);
      setOverlayVisible(false);
      setSubItemIdx(null);
    }
  }, [defaultSignal, isPast, hasPhoto]);

  useEffect(() => {
    setLocalSubItems(safeParse(item.sub_items));
  }, [item.sub_items]);

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
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSubItemsReorder = useCallback(async (newItems: any[]) => {
    setLocalSubItems(newItems);
    try {
      await apiFetch(
        `/api/trips/${item.trip_id}/itineraries/${item.id}/sub-items/reorder`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: newItems.map((s: any, i: number) => ({ id: s.id, display_order: i })) }),
        }
      );
    } catch {
      setLocalSubItems(safeParse(item.sub_items));
    }
  }, [item.trip_id, item.id, item.sub_items]);

  // Use the optimizer-resolved mode (when AUTO) or the user-set mode
  const displayMode = (item.next_transport_resolved_mode || item.next_transport_mode || '').toLowerCase();
  const isAutoUnresolved = (item.next_transport_mode || '').toUpperCase() === 'AUTO' && !item.next_transport_resolved_mode;

  const getTransportIcon = (size = 14) => {
    if (isAutoUnresolved) return <Sparkles size={size} />;
    if (displayMode === 'custom') {
      const label = (item as any).next_transport_custom_label;
      return label
        ? <span className="text-[9px] font-black leading-none">{label}</span>
        : <Sparkles size={size} />;
    }
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
      const sub = localSubItems[subItemIdx];
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
        {localSubItems.length > 0 && (
          <div className="space-y-1">
            <div className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.15em]">子活動</div>
            <SubItemsList
              items={localSubItems}
              walkOverrides={walkOverrides}
              onReorder={handleSubItemsReorder}
              onSelectItem={(idx) => setSubItemIdx(idx)}
            />
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

  const hasNavigation = !!(totalCards && totalCards > 1);

  const renderNavCenter = (onPhoto: boolean) => {
    if (!hasNavigation) return null;
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrevCard?.(); }}
          disabled={cardIndex === 0}
          className={clsx('p-0.5 rounded transition-colors disabled:opacity-20',
            onPhoto ? 'text-white/50 hover:text-white/80' : 'text-zinc-500 hover:text-zinc-300')}
        >
          <ChevronLeft size={13} />
        </button>
        <div className="flex gap-1 items-center">
          {Array.from({ length: totalCards! }).map((_, i) => (
            <div key={i} className={clsx('w-1.5 h-1.5 rounded-full transition-colors',
              i === cardIndex ? 'bg-orange-400' : (onPhoto ? 'bg-white/30' : 'bg-zinc-600'))} />
          ))}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNextCard?.(); }}
          disabled={cardIndex === totalCards! - 1 && !onAddBackup}
          className={clsx('p-0.5 rounded transition-colors disabled:opacity-20',
            onPhoto ? 'text-white/50 hover:text-white/80' : 'text-zinc-500 hover:text-zinc-300')}
        >
          <ChevronRight size={13} />
        </button>
        {canEdit && cardIndex === totalCards! - 1 && onAddBackup && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddBackup(); }}
            className={clsx('p-0.5 rounded transition-colors',
              onPhoto ? 'text-white/40 hover:text-orange-400' : 'text-zinc-600 hover:text-orange-400')}
          >
            <Plus size={13} />
          </button>
        )}
      </div>
    );
  };

  const renderBottomBar = (onPhoto: boolean) => {
    const hasBar = hasContent || (showNextTransport && (canEdit || !!item.next_transport_mode)) || hasNavigation;
    if (!hasBar) return null;
    if (onPhoto) {
      return (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-2 bg-black/50 backdrop-blur-[8px] border-t border-white/5">
          {detailParts.length > 0 ? (
            <button type="button" onClick={handleDetailBtn}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded-lg transition-all',
                overlayVisible ? 'text-orange-400 bg-orange-500/10' : 'text-white/55 hover:text-white/80')}>
              <span className="text-[9px] font-black tracking-wider">{detailLabel}</span>
            </button>
          ) : <div />}
          {renderNavCenter(true)}
          {showNextTransport && (canEdit || !!item.next_transport_mode) && (
            <button type="button" disabled={!canEdit}
              onClick={(e) => { e.stopPropagation(); if (canEdit && onEditNextTransport) onEditNextTransport(); }}
              className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors',
                canEdit ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : 'cursor-default')}>
              {item.next_transport_mode ? (
                <div className="flex items-center gap-1 text-zinc-400">
                  <span className="text-[8px] text-white/30 font-bold">下一站</span>
                  {getTransportIcon(12)}
                  <span className="text-[10px] font-black tracking-tight">
                    {manualVal > 0 ? formatDuration(manualVal) : autoVal > 0 ? formatDuration(autoVal) : '自動'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 text-white/30">
                  <Plus size={10} /><span className="text-[9px] font-bold">設定交通</span>
                </div>
              )}
            </button>
          )}
          {!showNextTransport && <div />}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        {detailParts.length > 0 ? (
          <button type="button" onClick={handleDetailBtn}
            className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all',
              overlayVisible ? 'text-orange-500 bg-orange-500/8' : 'text-zinc-600 hover:text-zinc-400')}>
            <span className="text-[9px] font-black tracking-wider">{detailLabel}</span>
          </button>
        ) : <div />}
        {renderNavCenter(false)}
        {showNextTransport && (canEdit || !!item.next_transport_mode) ? (
          <button type="button" disabled={!canEdit}
            onClick={(e) => { e.stopPropagation(); if (canEdit && onEditNextTransport) onEditNextTransport(); }}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors',
              canEdit ? 'cursor-pointer hover:bg-zinc-800/30 active:bg-zinc-800/50' : 'cursor-default')}>
          {item.next_transport_mode ? (
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="text-[9px] text-zinc-600 font-bold">下一站</span>
                {getTransportIcon()}
                <span className="text-[11px] font-black tracking-tight">
                  {manualVal > 0 ? formatDuration(manualVal) : autoVal > 0 ? formatDuration(autoVal) : '自動'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-zinc-600">
                <Plus size={11} /><span className="text-[9px] font-bold">設定交通</span>
              </div>
            )}
          </button>
        ) : <div />}
      </div>
    );
  };

  return (
    <div
      className={clsx('flex flex-col w-full mb-3 px-1 transition-all select-none', isDragOverlay && 'opacity-90 scale-105 shadow-2xl z-50')}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <div className={clsx(
        'relative flex flex-col bg-[#1c1c1e] rounded-[32px] overflow-hidden border transition-all',
        isConflicted     && 'border-red-500 ring-2 ring-red-500/50',
        isCircuitBreaker && 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-[#2a1a1a]',
        !isConflicted && !isCircuitBreaker && (canEdit ? 'border-zinc-800 hover:border-zinc-700' : 'border-zinc-800'),
      )}>

        {/* ── ROW 1: ICON ｜ 標題 ｜ 導航 ── */}
        <div
          className="px-4 pt-4 pb-2 flex items-center gap-3 min-h-[76px]"
          {...(dragHandleListeners as React.HTMLAttributes<HTMLDivElement>)}
          style={dragHandleListeners ? { touchAction: 'none' } : undefined}
        >
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
            {/* ── Time (top, clock style) ── */}
            {item.start_time ? (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={clsx(
                  'font-mono text-[13px] font-bold tracking-[0.06em] leading-none',
                  isPast ? 'text-zinc-600' : 'text-zinc-300',
                )}>
                  {item.start_time}{item.end_time && item.end_time !== item.start_time ? ` — ${item.end_time}` : ''}
                </span>
                {!(item as any).is_time_fixed && !isPast && <Sparkles size={9} className="text-orange-500/60" />}
                {isCircuitBreaker && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
              </div>
            ) : (
              <div className="flex items-center gap-1 mb-0.5 animate-pulse">
                <Sparkles size={9} className="text-zinc-600" />
                <span className="text-[11px] font-bold text-zinc-600 tracking-wide">待排程</span>
              </div>
            )}
            {/* ── Title ── */}
            <h4 className={clsx('text-[16px] font-black leading-tight truncate', isPast ? 'text-zinc-600' : 'text-white')}>
              {item.title}
            </h4>
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

          {item.rating && !isBackup && (
            <div className="shrink-0 flex items-center gap-0.5 bg-yellow-500/15 rounded-lg px-1.5 py-0.5">
              <Star size={9} className="text-yellow-400 fill-yellow-400" />
              <span className="text-[10px] font-black text-yellow-300">{(item.rating as number).toFixed(1)}</span>
            </div>
          )}

          {isBackup && (
            <>
              <span className="shrink-0 text-[9px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-md">備案</span>
              {onSwapToMain && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSwapToMain(); }}
                  className="shrink-0 px-2 py-1 rounded-xl bg-orange-500 text-white text-[10px] font-bold hover:bg-orange-600 transition-colors active:scale-95"
                >
                  切換為主要
                </button>
              )}
            </>
          )}

          {canEdit && !isBackup && (
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
              {/* 鎖頭：切換 is_time_fixed */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleLock?.(); }}
                className={clsx(
                  'shrink-0 p-2 rounded-xl transition-colors active:scale-90',
                  (item as any).is_time_fixed
                    ? 'text-orange-500 hover:text-orange-400'
                    : 'text-zinc-600 hover:text-zinc-400'
                )}
                title={(item as any).is_time_fixed ? '解鎖時間（讓 AI 可調整）' : '鎖定時間'}
              >
                {(item as any).is_time_fixed ? <Lock size={15} /> : <LockOpen size={15} />}
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
