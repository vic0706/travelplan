import React, { useState } from 'react';
import { Plane, Train, Ship, Car, Bed, Bus, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { parseISO, isSameDay, isPast } from 'date-fns';
import { Booking } from '../../types';

const CATEGORY_LABEL: Record<string, string> = {
  FLIGHT:           '機票',
  TRAIN:            '火車',
  FERRY:            '船票',
  BUS:              '公車',
  HOTEL:            '住宿',
  RENTAL:           '租車',
  PRIVATE_TRANSFER: '接送',
};

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
    case 'HOTEL':  return Bed;
    case 'BUS':    return Bus;
    default:       return Car;
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

  const details  = parseDetails(booking.details);
  const Icon     = getIcon(booking.category);
  const termLabel = TERMINAL_LABEL[booking.category] ?? '月台';
  const isTransport = ['FLIGHT','TRAIN','FERRY','BUS'].includes(booking.category);
  const isRental    = ['RENTAL','PRIVATE_TRANSFER'].includes(booking.category);

  const displayTitle = booking.category === 'RENTAL'
    ? `${booking.provider || ''} ${booking.title}`.trim()
    : booking.title;

  const dateStr = isCrossDay
    ? `${booking.start_date} → ${booking.end_date}`
    : booking.start_date;

  const timeStr = (() => {
    if (!booking.start_time) return '';
    if (booking.end_time && booking.end_time !== booking.start_time)
      return `${booking.start_time} → ${booking.end_time}`;
    return booking.start_time;
  })();

  return (
    <div
      className={clsx(
        'bg-[#1c1c1e] border rounded-3xl overflow-hidden transition-all',
        isTransport || isRental ? 'border-zinc-800' : 'border-zinc-800',
        canEdit ? 'cursor-pointer hover:border-orange-500/40 active:scale-[0.99]' : 'cursor-pointer',
        isPastItem && 'opacity-55 grayscale-[0.4]',
      )}
      onClick={() => canEdit ? onEdit() : setIsExpanded(v => !v)}
    >
      {/* ── Collapsed header ── */}
      <div className="flex items-center gap-4 px-4 py-4">
        {/* Large icon */}
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
          <Icon size={22} className="text-orange-400" />
        </div>

        {/* Core info */}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-black text-white leading-tight truncate">{displayTitle}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-black text-orange-500/70 uppercase tracking-widest">
              {CATEGORY_LABEL[booking.category] ?? booking.category}
            </span>
            {booking.provider && booking.category !== 'RENTAL' && (
              <>
                <span className="text-zinc-700 text-[10px]">·</span>
                <span className="text-[10px] text-zinc-500 truncate">{booking.provider}</span>
              </>
            )}
            {booking.order_id && (
              <>
                <span className="text-zinc-700 text-[10px]">·</span>
                <span className="text-[10px] text-zinc-600 font-mono">{booking.order_id}</span>
              </>
            )}
          </div>
          <div className="mt-1">
            <div className="font-mono text-[10px] text-zinc-600">{dateStr}</div>
            {timeStr && <div className="font-mono text-[12px] font-bold text-zinc-300 mt-0.5">{timeStr}</div>}
          </div>
        </div>

        {/* Expand chevron */}
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
        <div className="mx-4 mb-4 pt-3 border-t border-zinc-800/60 space-y-1.5">

          {/* Transport: dep → arr + terminal + check-in */}
          {isTransport && (
            <>
              {timeStr && (
                <div className="flex items-center gap-3 py-1">
                  <div className="text-center min-w-[52px]">
                    <div className="text-[18px] font-black text-white leading-none">{booking.start_time}</div>
                    <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">出發</div>
                    {details.dep_terminal && (
                      <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.dep_terminal}</div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="flex items-center w-full gap-1">
                      <div className="flex-1 h-px bg-zinc-800" />
                      {isCrossDay && <span className="text-[9px] text-orange-500 shrink-0">+1d</span>}
                      <div className="flex-1 h-px bg-zinc-800" />
                    </div>
                  </div>
                  <div className="text-center min-w-[52px]">
                    <div className="text-[18px] font-black text-white leading-none">{booking.end_time}</div>
                    <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">抵達</div>
                    {details.arr_terminal && (
                      <div className="text-[9px] text-orange-400 mt-0.5">{termLabel} {details.arr_terminal}</div>
                    )}
                  </div>
                </div>
              )}
              {details.check_in_time && (
                <div className="text-[11px] text-zinc-400">
                  報到 <span className="font-mono text-zinc-300">{details.check_in_time}</span>
                  {details.dep_buffer > 0 && <span className="text-zinc-600 ml-1.5">提前 {details.dep_buffer}分</span>}
                </div>
              )}
              {details.arr_stay > 0 && (
                <div className="text-[11px] text-zinc-500">抵達停留 {details.arr_stay}分</div>
              )}
            </>
          )}

          {/* Hotel specific */}
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

          {booking.notes && (
            <div className="text-[11px] text-zinc-400 italic leading-relaxed mt-1">{booking.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}
