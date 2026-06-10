import React, { useState, useEffect } from 'react';
import { Train, Ship, Car, Plane, Bus, Footprints, Bike, Plus, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO, isSameDay, isPast } from 'date-fns';
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

const CATEGORY_LABEL: Record<string, string> = {
  FLIGHT:           '機票',
  TRAIN:            '火車',
  FERRY:            '船票',
  BUS:              '公車',
  RENTAL:           '租車',
  PRIVATE_TRANSFER: '接送',
};

function parseDetails(d: any) {
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
  return d;
}

export function TransportationCard({
  item, booking, canEdit, isConflicted, onEdit,
  showNextTransport, onEditNextTransport,
  selectedDate, expandSignal, collapseSignal,
}: TransportationCardProps) {
  const data = booking;
  if (!data || !item) return null;

  const details     = parseDetails(data.details);
  const Icon        = getIcon(data.category);
  const termLabel   = TERMINAL_LABEL[data.category] ?? '月台';
  const isCrossDay  = data.start_date !== data.end_date;

  const itemDateTime = parseISO(`${format(selectedDate, 'yyyy-MM-dd')}T${item.start_time || '00:00'}`);
  const isToday      = isSameDay(selectedDate, new Date());
  const isPastItem   = !isNaN(itemDateTime.getTime()) && isPast(itemDateTime) && !isToday;

  const [isExpanded, setIsExpanded] = useState(!isPastItem);

  useEffect(() => { setIsExpanded(!isPastItem); }, [isPastItem]);
  useEffect(() => { if (expandSignal   > 0) setIsExpanded(true);  }, [expandSignal]);
  useEffect(() => { if (collapseSignal > 0) setIsExpanded(false); }, [collapseSignal]);

  const displayTitle = data.category === 'RENTAL'
    ? `${data.provider || ''} ${data.title}`.trim()
    : data.title;

  const nextManual = parseInt((item.next_transport_time || '').replace(/\D/g, '') || '0');
  const nextAuto   = Math.round(Number(item.next_transport_auto_time || 0));
  const nextDisplay = nextManual > 0 ? `${nextManual}分` : nextAuto > 0 ? `${nextAuto}分` : '自動';
  const nextMode = (item.next_transport_mode || '').toUpperCase();

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
      <div className="flex items-center gap-4 px-4 py-4">
        {/* Large icon */}
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
          <Icon size={22} className="text-orange-400" />
        </div>

        {/* Core info */}
        <div className="flex-1 min-w-0">
          {item.start_time && (
            <div className="font-mono text-[13px] font-bold tracking-[0.06em] leading-none text-zinc-300 mb-0.5">
              {item.start_time}{item.end_time && item.end_time !== item.start_time ? ` → ${item.end_time}` : ''}
            </div>
          )}
          <div className="text-[15px] font-black text-white leading-tight truncate">
            {displayTitle}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-black text-orange-500/70 uppercase tracking-widest">
              {CATEGORY_LABEL[data.category] ?? data.category}
            </span>
            {data.provider && data.category !== 'RENTAL' && (
              <>
                <span className="text-zinc-700 text-[10px]">·</span>
                <span className="text-[10px] text-zinc-500">{data.provider}</span>
              </>
            )}
          </div>
        </div>

        {/* Right side: next-transport + expand */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 下一站 */}
          {showNextTransport && (canEdit || !!item.next_transport_mode) && (
            <button
              type="button"
              disabled={!canEdit}
              onClick={(e) => { e.stopPropagation(); if (canEdit) onEditNextTransport?.(); }}
              className={clsx(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors text-[9px] font-bold',
                canEdit ? 'hover:bg-zinc-800 cursor-pointer' : 'cursor-default',
                item.next_transport_mode ? 'text-orange-400' : 'text-zinc-600',
              )}
            >
              {item.next_transport_mode ? (
                <>
                  {nextMode === 'WALKING'   && <Footprints size={14} />}
                  {nextMode === 'BICYCLING' && <Bike size={14} />}
                  {nextMode === 'TRANSIT'   && <Bus size={14} />}
                  {nextMode === 'DRIVING'   && <Car size={14} />}
                  {!['WALKING','BICYCLING','TRANSIT','DRIVING'].includes(nextMode) && <Car size={14} />}
                  <span>{nextDisplay}</span>
                </>
              ) : (
                <Plus size={14} />
              )}
            </button>
          )}

          {/* Expand chevron */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(v => !v); }}
            className="p-2 rounded-xl text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <ChevronDown
              size={16}
              className={clsx('transition-transform duration-200', isExpanded && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {isExpanded && (
        <div className="mx-4 mb-4 pt-3 border-t border-zinc-800/60 space-y-2">
          {/* Dep → Arr times */}
          {data.start_time && (
            <div className="flex items-center gap-3 py-1">
              <div className="text-center min-w-[52px]">
                <div className="text-[18px] font-black text-white leading-none">{data.start_time}</div>
                <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">出發</div>
                {details.dep_terminal && (
                  <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.dep_terminal}</div>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center gap-1">
                <div className="flex-1 h-px bg-zinc-800" />
                {isCrossDay && <span className="text-[9px] text-orange-500 shrink-0 px-1">+1d</span>}
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
              <div className="text-center min-w-[52px]">
                <div className="text-[18px] font-black text-white leading-none">{data.end_time}</div>
                <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">抵達</div>
                {details.arr_terminal && (
                  <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.arr_terminal}</div>
                )}
              </div>
            </div>
          )}

          {/* Check-in / buffer */}
          {details.check_in_time && (
            <div className="text-[11px] text-zinc-400">
              報到 <span className="font-mono text-zinc-300">{details.check_in_time}</span>
              {details.dep_buffer > 0 && (
                <span className="text-zinc-600 ml-1.5">提前 {details.dep_buffer}分</span>
              )}
            </div>
          )}
          {details.arr_stay > 0 && (
            <div className="text-[11px] text-zinc-500">抵達停留 {details.arr_stay}分</div>
          )}

          {/* Order info */}
          {(data.order_id || data.category === 'RENTAL') && (
            <div className="text-[11px] text-zinc-500 font-mono">
              {data.order_id && `#${data.order_id}`}
            </div>
          )}

          {data.notes && (
            <div className="text-[11px] text-zinc-400 italic leading-relaxed">{data.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}
