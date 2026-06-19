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

const WEEKDAYS = ['日','一','二','三','四','五','六'];
function fmtDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  } catch { return dateStr.slice(5).replace('-', '/'); }
}

interface BookingCardProps {
  booking: Booking;
  canEdit: boolean;
  onEdit: () => void;
  rentalView?: 'pickup' | 'return';
}

export function BookingCard({ booking, canEdit, onEdit, rentalView }: BookingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const refDateStr = rentalView === 'return' ? (booking.end_date || booking.start_date) : booking.start_date;
  const refTimeStr = rentalView === 'return' ? booking.end_time : booking.start_time;
  const startDate = (() => { try { return parseISO(`${refDateStr}T${refTimeStr || '00:00'}`); } catch { return null; } })();
  const isToday    = startDate && isSameDay(startDate, new Date());
  const isPastItem = startDate && !isNaN(startDate.getTime()) && isPast(startDate) && !isToday;
  const isCrossDay = booking.start_date !== booking.end_date;

  const details   = parseDetails(booking.details);
  const Icon      = getIcon(booking.category);
  const termLabel = TERMINAL_LABEL[booking.category] ?? '月台';
  const isTransport  = ['FLIGHT','TRAIN','FERRY','BUS'].includes(booking.category);
  const isRental     = ['RENTAL','PRIVATE_TRANSFER'].includes(booking.category);
  const isHotel      = booking.category === 'HOTEL';
  const isRestaurant = booking.category === 'RESTAURANT';

  const displayTitle = rentalView === 'pickup' ? `取車：${booking.title}`
    : rentalView === 'return' ? `還車：${booking.title}`
    : booking.title;

  const nights = isHotel && isCrossDay
    ? Math.round((parseISO(booking.end_date + 'T00:00:00').getTime() -
                  parseISO(booking.start_date + 'T00:00:00').getTime()) / 86400000)
    : 0;

  const chipStr = (() => {
    if (rentalView) {
      const date = rentalView === 'pickup' ? booking.start_date : (booking.end_date || booking.start_date);
      const time = rentalView === 'pickup' ? booking.start_time : booking.end_time;
      return time ? `${fmtDate(date)} ${time}` : fmtDate(date);
    }
    if (isHotel) {
      const base = `${fmtDate(booking.start_date)} — ${fmtDate(booking.end_date)}`;
      return nights > 0 ? `${base} · ${nights}晚` : base;
    }
    if (isRestaurant) {
      const adultPax = details.adult_pax;
      const childPax = details.child_pax;
      const paxStr = [adultPax && `大人${adultPax}`, childPax && `小孩${childPax}`]
        .filter(Boolean).join('+');
      const timeRange = booking.start_time
        ? (booking.end_time && booking.end_time !== booking.start_time
            ? `${booking.start_time} — ${booking.end_time}` : booking.start_time)
        : '';
      const base = `${fmtDate(booking.start_date)}${timeRange ? ` ${timeRange}` : ''}`;
      return paxStr ? `${base} · ${paxStr}` : base;
    }
    if (!booking.start_time) return fmtDate(booking.start_date);
    if (isCrossDay) {
      const endPart = booking.end_time ? ` ${booking.end_time}` : '';
      return `${fmtDate(booking.start_date)} ${booking.start_time} → ${fmtDate(booking.end_date)}${endPart}`;
    }
    const endPart = booking.end_time && booking.end_time !== booking.start_time
      ? ` — ${booking.end_time}` : '';
    return `${fmtDate(booking.start_date)} ${booking.start_time}${endPart}`;
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
          {/* 標題 — 第一行，最重要的識別資訊 */}
          <div className="text-[15px] font-black text-white leading-tight truncate">{displayTitle}</div>
          {/* 日期+時間 chip — 第二行 */}
          {chipStr && (
            <div className="mt-0.5 text-[11px] font-semibold text-zinc-400 leading-tight">{chipStr}</div>
          )}
          {/* 供應商 + 訂單號 — 第三行 */}
          {(booking.provider || booking.order_id) && rentalView !== 'return' && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {booking.provider && <span className="text-[10px] text-zinc-600">{booking.provider}</span>}
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
          {isRental && rentalView !== 'return' && details.pickup_buffer > 0 && (
            <div className="text-[11px] text-zinc-400">取車等候 {details.pickup_buffer}分</div>
          )}
          {isRental && rentalView !== 'pickup' && details.return_buffer > 0 && (
            <div className="text-[11px] text-zinc-400">還車手續 {details.return_buffer}分</div>
          )}
          {isRental && rentalView === 'return' && booking.end_location && booking.end_location !== booking.start_location && (
            <div className="text-[11px] text-zinc-400">{booking.end_location}</div>
          )}

          {/* Restaurant */}
          {isRestaurant && (details.adult_pax || details.child_pax) && (
            <div className="text-[11px] text-zinc-400">
              {[details.adult_pax && `大人 ${details.adult_pax}`, details.child_pax && `小孩 ${details.child_pax}`]
                .filter(Boolean).join(' · ')}
            </div>
          )}

          {booking.notes && (
            <div className="text-[11px] text-zinc-400 italic leading-relaxed">{booking.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}
