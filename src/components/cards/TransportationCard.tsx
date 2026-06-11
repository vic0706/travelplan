import React, { useState, useEffect } from 'react';
import { Train, Ship, Car, Plane, Bus, Footprints, Bike, Plus, ChevronDown, Navigation2, Motorbike } from 'lucide-react';
import { clsx } from 'clsx';
import { Itinerary, Booking } from '../../types';

interface TransportationCardProps {
  item?: Itinerary;
  booking?: Booking;
  canEdit: boolean;
  isConflicted?: boolean;
  onEdit: () => void;
  showNextTransport?: boolean;
  onEditNextTransport?: () => void;
  selectedDate: Date;
  expandSignal: number;
  collapseSignal: number;
  defaultSignal?: number;
}

function getIcon(category: string) {
  switch (category) {
    case 'TRAIN': return Train;
    case 'FERRY': return Ship;
    case 'BUS':   return Bus;
    default:      return Plane;
  }
}

const TERMINAL_LABEL: Record<string, string> = {
  FLIGHT: '航廈',
  TRAIN:  '月台',
  FERRY:  '碼頭',
  BUS:    '站牌',
};

function parseDetails(d: any) {
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
  return d;
}

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function TransportationCard({
  item, booking, canEdit, isConflicted, onEdit,
  showNextTransport, onEditNextTransport,
  selectedDate: _selectedDate, expandSignal, collapseSignal, defaultSignal,
}: TransportationCardProps) {
  const data = booking;
  if (!data || !item) return null;

  const details    = parseDetails(data.details);
  const Icon       = getIcon(data.category);
  const termLabel  = TERMINAL_LABEL[data.category] ?? '月台';
  // A2: use end_time to determine past, no isToday exception
  const endTimeStr = item.end_time || item.start_time || '23:59';
  const isPastItem = !!(item as any).date && Date.now() > new Date(`${(item as any).date}T${endTimeStr}`).getTime();

  const [isExpanded, setIsExpanded] = useState(!isPastItem);

  useEffect(() => { setIsExpanded(!isPastItem); }, [isPastItem]);
  useEffect(() => { if (expandSignal   > 0) setIsExpanded(true);  }, [expandSignal]);
  useEffect(() => { if (collapseSignal > 0) setIsExpanded(false); }, [collapseSignal]);
  useEffect(() => { if (defaultSignal && defaultSignal > 0) setIsExpanded(!isPastItem); }, [defaultSignal, isPastItem]);

  const displayTitle = data.category === 'RENTAL'
    ? `${data.provider || ''} ${data.title}`.trim()
    : data.title;

  const nextManual  = parseInt((item.next_transport_time || '').replace(/\D/g, '') || '0');
  const nextAuto    = Math.round(Number(item.next_transport_auto_time || 0));
  const nextDisplay = nextManual > 0 ? `${nextManual}分` : nextAuto > 0 ? `${nextAuto}分` : '自動';
  const nextMode    = (item.next_transport_mode || '').toUpperCase();

  // Navigation to departure station
  const depNavUrl = data.start_location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.start_location)}`
    : null;

  const openDepNav = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!depNavUrl) return;
    const a = document.createElement('a');
    a.href = depNavUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 4-milestone timeline values
  const arrEnd = data.end_time && details.arr_stay > 0 ? addMins(data.end_time, details.arr_stay) : null;

  const showBottomBar = showNextTransport && (canEdit || !!item.next_transport_mode);

  return (
    <div
      className={clsx(
        'bg-[#1c1c1e] border rounded-3xl overflow-hidden transition-all',
        isConflicted
          ? 'border-red-500 ring-2 ring-red-500/50'
          : 'border-zinc-800 hover:border-zinc-700',
        canEdit && 'cursor-pointer hover:border-orange-500/40 active:scale-[0.99]',
        isPastItem && !isExpanded && 'opacity-55 grayscale-[0.4]',
      )}
      onClick={() => canEdit ? onEdit() : setIsExpanded(v => !v)}
    >
      {/* ── Header row ── */}
      <div className="flex items-center gap-4 px-4 py-4 min-h-[80px]">
        {/* Large icon */}
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
          <Icon size={22} className="text-orange-400" />
        </div>

        {/* Core info */}
        <div className="flex-1 min-w-0">
          {/* 時間行 */}
          {item.start_time && (
            <div className="font-mono text-[13px] font-bold tracking-[0.06em] leading-none text-zinc-300 mb-0.5">
              {item.start_time}
              {item.end_time && item.end_time !== item.start_time ? ` → ${item.end_time}` : ''}
            </div>
          )}
          <div className="text-[15px] font-black text-white leading-tight truncate">
            {displayTitle}
          </div>
          {/* A4: provider + order_id in header */}
          {(data.provider || data.order_id) && data.category !== 'RENTAL' && (
            <div className="flex items-center gap-1.5 mt-0.5">
              {data.provider && <span className="text-[10px] text-zinc-500">{data.provider}</span>}
              {data.provider && data.order_id && <span className="text-[10px] text-zinc-700">·</span>}
              {data.order_id && <span className="text-[10px] text-zinc-600 font-mono">#{data.order_id}</span>}
            </div>
          )}
        </div>

        {/* 右側按鈕：有出發地時顯示導航，否則顯示展開/折疊 */}
        {depNavUrl ? (
          <button
            type="button"
            onClick={openDepNav}
            className="shrink-0 p-2 rounded-xl text-zinc-600 hover:text-orange-400 transition-colors"
          >
            <Navigation2 size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(v => !v); }}
            className="shrink-0 p-2 rounded-xl text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <ChevronDown
              size={16}
              className={clsx('transition-transform duration-200', isExpanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* ── Expanded details ── */}
      {isExpanded && (
        <div className="mx-4 mb-3 pt-3 border-t border-zinc-800/60 space-y-2">

          {/* 4-milestone or 2-point timeline */}
          {data.start_time && (
            <div className="flex items-end gap-1 py-1 overflow-x-auto no-scrollbar">
              {/* Check-in milestone */}
              {details.check_in_time && (
                <>
                  <div className="text-center shrink-0 min-w-[44px]">
                    <div className="text-[16px] font-black text-white leading-none">{details.check_in_time}</div>
                    <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">報到</div>
                    {details.dep_terminal && (
                      <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.dep_terminal}</div>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-zinc-800 mb-3 min-w-[8px]" />
                </>
              )}

              {/* Departure */}
              <div className="text-center shrink-0 min-w-[44px]">
                <div className="text-[16px] font-black text-white leading-none">{data.start_time}</div>
                <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">出發</div>
                {!details.check_in_time && details.dep_terminal && (
                  <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.dep_terminal}</div>
                )}
              </div>

              {/* Centre line */}
              <div className="flex-1 h-px bg-zinc-800 mb-3 min-w-[8px]" />

              {/* Arrival */}
              <div className="text-center shrink-0 min-w-[44px]">
                <div className="text-[16px] font-black text-white leading-none">{data.end_time}</div>
                <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">抵達</div>
                {details.arr_terminal && (
                  <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.arr_terminal}</div>
                )}
              </div>

              {/* arr_stay milestone */}
              {arrEnd && (
                <>
                  <div className="flex-1 h-px bg-zinc-800 mb-3 min-w-[8px]" />
                  <div className="text-center shrink-0 min-w-[44px]">
                    <div className="text-[16px] font-black text-zinc-400 leading-none">{arrEnd}</div>
                    <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">停留</div>
                  </div>
                </>
              )}
            </div>
          )}

          {data.notes && (
            <div className="text-[11px] text-zinc-400 italic leading-relaxed">{data.notes}</div>
          )}
        </div>
      )}

      {/* ── Bottom bar: next-transport only ── */}
      {showBottomBar && (
        <div className="flex items-center justify-end px-3 pb-3 pt-1">
          <button
            type="button"
            disabled={!canEdit}
            onClick={(e) => { e.stopPropagation(); if (canEdit) onEditNextTransport?.(); }}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors',
              canEdit ? 'cursor-pointer hover:bg-zinc-800/30 active:bg-zinc-800/50' : 'cursor-default',
            )}
          >
            {item.next_transport_mode ? (
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="text-[9px] text-zinc-600 font-bold">下一站</span>
                {nextMode === 'WALKING'    && <Footprints size={13} />}
                {nextMode === 'BICYCLING'  && <Bike size={13} />}
                {nextMode === 'TRANSIT'    && <Bus size={13} />}
                {nextMode === 'DRIVING'    && <Car size={13} />}
                {nextMode === 'MOTORCYCLING' && <Motorbike size={13} />}
                {!['WALKING','BICYCLING','TRANSIT','DRIVING','MOTORCYCLING'].includes(nextMode) && <Car size={13} />}
                <span className="text-[11px] font-black tracking-tight">{nextDisplay}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-zinc-600">
                <Plus size={11} /><span className="text-[9px] font-bold">設定交通</span>
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
