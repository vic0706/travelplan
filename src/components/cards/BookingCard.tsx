import React from 'react';
import { Plane, Train, Ship, Car, Bed, Info, Calendar, MapPin, Edit3 } from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO, isSameDay, isPast } from 'date-fns';
import { Booking } from '../../types';

// 輔助函數：處理網址顯示
const renderLocation = (loc: string, terminal?: string) => {
  if (!loc) return null;
  if (loc.startsWith('http')) {
      return (
          <a href={loc} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 hover:underline transition-colors" onClick={e => e.stopPropagation()}>
              [ Map Link ]
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
  const startDate = parseISO(`${booking.start_date}T${booking.start_time}`);
  const endDate = parseISO(`${booking.end_date}T${booking.end_time}`);
  const isValidStart = !isNaN(startDate.getTime());
  const isValidEnd = !isNaN(endDate.getTime());
  const isToday = isValidStart && isSameDay(startDate, new Date());
  const isPastItem = isValidStart && isPast(startDate) && !isToday;

  const getIcon = () => {
    switch (booking.category) {
      case 'FLIGHT': return Plane;
      case 'TRAIN': return Train;
      case 'FERRY': return Ship;
      case 'RENTAL': return Car;
      case 'PRIVATE_TRANSFER': return Car;
      case 'HOTEL': return Bed;
      default: return Info;
    }
  };

  const Icon = getIcon();

  return (
    <div 
      onClick={() => canEdit && onEdit()}
      className={clsx(
        "bg-zinc-900 border border-zinc-800 rounded-3xl p-5 transition-all group relative overflow-hidden",
        canEdit && "hover:border-orange-500/50 cursor-pointer active:scale-[0.98]",
        isPastItem && "opacity-60 grayscale-[0.5]"
      )}
    >
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-zinc-800 text-orange-500"><Icon size={14} /></div>
            <h4 className="font-bold text-white truncate">{booking.category === 'RENTAL' ? `${booking.provider || ''} ${booking.title}` : booking.title}</h4>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
              <Calendar size={12} />
              <span>{isValidStart ? format(startDate, 'MMM d') : booking.start_date} {booking.start_time}</span>
              {isValidEnd && <><span className="mx-1">→</span><span>{format(endDate, 'MMM d')} {booking.end_time}</span></>}
            </div>
            {booking.start_location && (
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs truncate">
                <MapPin size={12} className="shrink-0" />
                <div className="truncate">
                  {renderLocation(booking.start_location, (() => { try { return JSON.parse(booking.details as string).dep_terminal; } catch(e) { return (booking.details as any)?.dep_terminal; } })())}
                  {booking.end_location && (
                    <>
                      <span className="mx-1">→</span>
                      {renderLocation(booking.end_location, (() => { try { return JSON.parse(booking.details as string).arr_terminal; } catch(e) { return (booking.details as any)?.arr_terminal; } })())}
                    </>
                  )}
                </div>
              </div>
            )}
            {booking.provider && booking.category !== 'RENTAL' && (
              <div className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">{booking.provider} {booking.order_id && `• ${booking.order_id}`}</div>
            )}
            {booking.notes && <div className="text-xs text-zinc-500 italic mt-1 line-clamp-2">{booking.notes}</div>}
          </div>
        </div>
        {canEdit && <div className="p-2 text-zinc-600 group-hover:text-orange-500 transition-colors"><Edit3 size={16} /></div>}
      </div>
    </div>
  );
}