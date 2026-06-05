import React from 'react';
import { Plane, Train, Ship, Car, Bed, Bus, Info, Calendar, MapPin, Edit3 } from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO, isSameDay, isPast } from 'date-fns';
import { Booking } from '../../types';

const categoryInfo: Record<string, { Icon: any; color: string; label: string }> = {
  HOTEL:            { Icon: Bed,  color: '#f97316', label: '住宿' },
  FLIGHT:           { Icon: Plane, color: '#3b82f6', label: '機票' },
  TRAIN:            { Icon: Train, color: '#22c55e', label: '火車' },
  FERRY:            { Icon: Ship,  color: '#06b6d4', label: '船票' },
  RENTAL:           { Icon: Car,   color: '#a855f7', label: '租車' },
  PRIVATE_TRANSFER: { Icon: Car,   color: '#6366f1', label: '接送' },
  BUS:              { Icon: Bus,   color: '#eab308', label: '巴士' },
};

const renderLocation = (loc: string, terminal?: string) => {
  if (!loc) return null;
  if (loc.startsWith('http')) {
    return (
      <a href={loc} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 hover:underline transition-colors" onClick={e => e.stopPropagation()}>
        [ 地圖連結 ]
      </a>
    );
  }
  return <span>{loc}{terminal ? ` (T${terminal})` : ''}</span>;
};

interface BookingCardProps {
  booking: Booking;
  canEdit: boolean;
  onEdit: () => void;
}

export function BookingCard({ booking, canEdit, onEdit }: BookingCardProps) {
  const startDate = parseISO(`${booking.start_date}T${booking.start_time || '00:00'}`);
  const endDate   = parseISO(`${booking.end_date}T${booking.end_time || '00:00'}`);
  const isValidStart = !isNaN(startDate.getTime());
  const isValidEnd   = !isNaN(endDate.getTime());
  const isToday    = isValidStart && isSameDay(startDate, new Date());
  const isPastItem = isValidStart && isPast(startDate) && !isToday;

  const info = categoryInfo[booking.category] || { Icon: Info, color: '#71717a', label: '其他' };
  const { Icon, color, label } = info;

  const details: any = (() => {
    if (!booking.details) return {};
    if (typeof booking.details === 'string') {
      try { return JSON.parse(booking.details); } catch { return {}; }
    }
    return booking.details;
  })();

  const depTerminal = details.dep_terminal;
  const arrTerminal = details.arr_terminal;

  return (
    <div
      onClick={() => canEdit && onEdit()}
      className={clsx(
        'flex overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 transition-all group',
        canEdit && 'cursor-pointer hover:border-zinc-700 active:scale-[0.98]',
        isPastItem && 'opacity-60 grayscale-[0.5]',
      )}
    >
      {/* Left icon strip */}
      <div
        className="w-14 shrink-0 flex flex-col items-center justify-center gap-1.5 py-5 border-r border-zinc-800/60"
        style={{ backgroundColor: `${color}10` }}
      >
        <Icon size={24} style={{ color }} />
        <span className="text-[9px] font-black tracking-wider" style={{ color: `${color}bb` }}>{label}</span>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="font-bold text-white leading-tight">
            {booking.category === 'RENTAL' ? `${booking.provider || ''} ${booking.title}` : booking.title}
          </h4>
          {canEdit && <Edit3 size={15} className="shrink-0 text-zinc-600 group-hover:text-orange-500 transition-colors mt-0.5" />}
        </div>

        <div className="space-y-1.5">
          {/* Date / time */}
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
            <Calendar size={11} />
            <span>
              {isValidStart ? format(startDate, 'MMM d') : booking.start_date}
              {booking.start_time ? ` ${booking.start_time}` : ''}
              {(isValidEnd || booking.end_date) && (
                <>
                  {' → '}
                  {isValidEnd ? format(endDate, 'MMM d') : booking.end_date}
                  {booking.end_time ? ` ${booking.end_time}` : ''}
                </>
              )}
            </span>
          </div>

          {/* Location */}
          {booking.start_location && (
            <div className="flex items-center gap-1.5 text-zinc-500 text-xs truncate">
              <MapPin size={11} className="shrink-0" />
              <div className="truncate">
                {renderLocation(booking.start_location, depTerminal)}
                {booking.end_location && (
                  <>
                    <span className="mx-1">→</span>
                    {renderLocation(booking.end_location, arrTerminal)}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Provider + order */}
          {booking.provider && (
            <div className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">
              {booking.provider}{booking.order_id ? ` • ${booking.order_id}` : ''}
            </div>
          )}

          {/* Notes */}
          {booking.notes && (
            <div className="text-xs text-zinc-500 italic line-clamp-2">{booking.notes}</div>
          )}
        </div>
      </div>
    </div>
  );
}
