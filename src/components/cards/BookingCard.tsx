import React, { useState } from 'react';
import { Plane, Train, Ship, Car, Bed, Bus, UtensilsCrossed, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { parseISO, isSameDay, isPast } from 'date-fns';
import { Booking } from '../../types';

const TERMINAL_LABEL: Record<string, string> = {
  FLIGHT: '航廈',
  TRAIN:  '月台',
  FERRY:  '碼頭',
  BUS:    '站牌',
};

function getIcon(category: string) {
  switch (category) {
    case 'FLIGHT': return Plane;
    case 'TRAIN':  return Train;
    case 'FERRY':  return Ship;
    case 'HOTEL':      return Bed;
    case 'BUS':        return Bus;
    case 'RESTAURANT': return UtensilsCrossed;
    default:           return Car;
  }
}

function parseDetails(d: any) {
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
  return d;
}

interface BookingCardProps {
  booking: Booking;
  canEdit: boolean;
  onEdit: () => void;
}

export function BookingCard({ booking, canEdit, onEdit }: BookingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const startDate = (() => { try { return parseISO(`${booking.start_date}T${booking.start_time || '00:00'}`); } catch { return null; } })();
  const isToday    = startDate && isSameDay(startDate, new Date());
  const isPastItem = startDate && !isNaN(startDate.getTime()) && isPast(startDate) && !isToday;
  const isCrossDay = booking.start_date !== booking.end_date;

  const details   = parseDetails(booking.details);
  const Icon      = getIcon(booking.category);
  const termLabel = TERMINAL_LABEL[booking.category] ?? '月台';
  const isTransport = ['FLIGHT','TRAIN','FERRY','BUS'].includes(booking.category);
  const isRental    = ['RENTAL','PRIVATE_TRANSFER'].includes(booking.category);

  const displayTitle = isRental
    ? `${booking.provider || ''} ${booking.title}`.trim()
    : booking.title;

  const dateStr = isCrossDay
    ? `${booking.start_date} → ${booking.end_date}`
    : booking.start_date;

  const timeStr = (() => {
    if (!booking.start_time) return '';
    const startPart = isCrossDay
      ? `${booking.start_date.slice(5).replace('-', '/')} ${booking.start_time}`
      : booking.start_time;
    const endPart = booking.end_time && booking.end_time !== booking.start_time
      ? (isCrossDay
          ? ` — ${booking.end_date.slice(5).replace('-', '/')} ${booking.end_time}`
          : ` — ${booking.end_time}`)
      : '';
    return `${startPart}${endPart}`;
  })();

  return (
    <div
      className={clsx(
        'bg-[#1c1c1e] border rounded-3xl overflow-hidden transition-all',
        'border-zinc-800 hover:border-zinc-700',
        canEdit ? 'cursor-pointer hover:border-orange-500/40 active:scale-[0.99]' : 'cursor-pointer',
        isPastItem && 'opacity-55 grayscale-[0.4]',
      )}
      onClick={() => canEdit ? onEdit() : setIsExpanded(v => !v)}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-4 py-4 min-h-[80px]">
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
          <Icon size={22} className="text-orange-400" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Date row — hidden for cross-day (date is merged into timeStr) */}
          {booking.start_date && !isCrossDay && (
            <div className="font-mono text-[10px] text-zinc-600 mb-0.5">{dateStr}</div>
          )}
          {/* Time row */}
          {timeStr && (
            <div className="font-mono text-[13px] font-bold tracking-[0.06em] leading-none text-zinc-300 mb-0.5">
              {timeStr}
            </div>
          )}
          {/* Title */}
          <div className="text-[15px] font-black text-white leading-tight truncate">{displayTitle}</div>
          {/* Provider + order_id */}
          {(booking.provider || booking.order_id) && !isRental && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {booking.provider && <span className="text-[10px] text-zinc-500">{booking.provider}</span>}
              {booking.provider && booking.order_id && <span className="text-zinc-700 text-[10px]">·</span>}
              {booking.order_id && <span className="text-[10px] text-zinc-600 font-mono">#{booking.order_id}</span>}
            </div>
          )}
        </div>

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
      </div>

      {/* ── Expanded details ── */}
      {isExpanded && (
        <div className="mx-4 mb-4 pt-3 border-t border-zinc-800/60 space-y-2">

          {/* Transport: timeline dep → arr */}
          {isTransport && booking.start_time && (
            <div className="flex items-end gap-1 py-1 overflow-x-auto no-scrollbar">
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
              <div className="text-center shrink-0 min-w-[44px]">
                {isCrossDay && <div className="text-[9px] text-zinc-500 font-mono leading-none mb-0.5">{booking.start_date.slice(5).replace('-', '/')}</div>}
                <div className="text-[16px] font-black text-white leading-none">{booking.start_time}</div>
                <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">出發</div>
                {!details.check_in_time && details.dep_terminal && (
                  <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.dep_terminal}</div>
                )}
              </div>
              <div className="flex-1 h-px bg-zinc-800 mb-3 min-w-[8px]" />
              <div className="text-center shrink-0 min-w-[44px]">
                {isCrossDay && <div className="text-[9px] text-zinc-500 font-mono leading-none mb-0.5">{booking.end_date.slice(5).replace('-', '/')}</div>}
                <div className="text-[16px] font-black text-white leading-none">{booking.end_time}</div>
                <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">抵達</div>
                {details.arr_terminal && (
                  <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.arr_terminal}</div>
                )}
              </div>
            </div>
          )}

          {/* Hotel */}
          {booking.category === 'HOTEL' && (
            <>
              {(details.check_in_stay || details.check_out_stay) && (
                <div className="text-[11px] text-zinc-400">
                  入住辦理 {details.check_in_stay ?? 0}分
                  {details.check_out_stay ? ` · 退房辦理 ${details.check_out_stay}分` : ''}
                </div>
              )}
              {(details.daily_start_time || details.daily_end_time) && (
                <div className="text-[11px] text-zinc-400">
                  每日出門 {details.daily_start_time || '—'}
                  {details.daily_end_time && ` · 返回 ${details.daily_end_time}`}
                </div>
              )}
            </>
          )}

          {/* Rental / Transfer */}
          {isRental && (
            <>
              {details.pickup_buffer > 0 && (
                <div className="text-[11px] text-zinc-400">取車等候 {details.pickup_buffer}分</div>
              )}
              {details.return_buffer > 0 && (
                <div className="text-[11px] text-zinc-400">還車手續 {details.return_buffer}分</div>
              )}
            </>
          )}

          {/* Restaurant */}
          {booking.category === 'RESTAURANT' && details.pax && (
            <div className="text-[11px] text-zinc-400">{details.pax} 人</div>
          )}

          {booking.notes && (
            <div className="text-[11px] text-zinc-400 italic leading-relaxed">{booking.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}
