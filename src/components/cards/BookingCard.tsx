import React from 'react';
import { Plane, Train, Ship, Car, Bed, Bus, Info, Calendar, MapPin, Edit3 } from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO, isSameDay, isPast } from 'date-fns';
import { Booking } from '../../types';

const renderLocation = (loc: string, terminal?: string) => {
  if (!loc) return null;
  if (loc.startsWith('http')) {
    return (
      <a href={loc} target="_blank" rel="noopener noreferrer"
        className="text-orange-500 hover:text-orange-400 hover:underline transition-colors"
        onClick={e => e.stopPropagation()}>
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
  const endDate = parseISO(`${booking.end_date}T${booking.end_time || '00:00'}`);
  const isValidStart = !isNaN(startDate.getTime());
  const isValidEnd = !isNaN(endDate.getTime());
  const isToday = isValidStart && isSameDay(startDate, new Date());
  const isPastItem = isValidStart && isPast(startDate) && !isToday;

  const getIcon = () => {
    switch (booking.category) {
      case 'FLIGHT':           return Plane;
      case 'TRAIN':            return Train;
      case 'FERRY':            return Ship;
      case 'RENTAL':           return Car;
      case 'PRIVATE_TRANSFER': return Car;
      case 'HOTEL':            return Bed;
      case 'BUS':              return Bus;
      default:                 return Info;
    }
  };

  const Icon = getIcon();
  const isHotel = booking.category === 'HOTEL';
  const hasPhoto = isHotel && !!booking.image_url;

  const details = (() => {
    try { return typeof booking.details === 'string' ? JSON.parse(booking.details) : (booking.details || {}); }
    catch { return {}; }
  })();

  return (
    <div
      onClick={() => canEdit && onEdit()}
      className={clsx(
        'bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden transition-all group relative',
        canEdit && 'hover:border-orange-500/50 cursor-pointer active:scale-[0.98]',
        isPastItem && 'opacity-60 grayscale-[0.5]'
      )}
    >
      {/* Hotel photo header */}
      {hasPhoto && (
        <div className="relative h-28 w-full overflow-hidden">
          <img
            src={booking.image_url}
            alt={booking.title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
            onLoad={e => { e.currentTarget.classList.remove('opacity-0'); e.currentTarget.classList.add('opacity-80'); }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
          {canEdit && (
            <div className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-sm rounded-lg text-zinc-400 group-hover:text-orange-500 transition-colors">
              <Edit3 size={14} />
            </div>
          )}
        </div>
      )}

      <div className="p-5">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-zinc-800 text-orange-500 shrink-0"><Icon size={14} /></div>
              <h4 className="font-bold text-white truncate">
                {booking.category === 'RENTAL' ? `${booking.provider || ''} ${booking.title}` : booking.title}
              </h4>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                <Calendar size={12} />
                <span>{isValidStart ? format(startDate, 'MMM d') : booking.start_date} {booking.start_time}</span>
                {(isValidEnd || booking.end_date) && (
                  <>
                    <span className="mx-1">→</span>
                    <span>{isValidEnd ? format(endDate, 'MMM d') : booking.end_date} {booking.end_time}</span>
                  </>
                )}
              </div>
              {booking.start_location && (
                <div className="flex items-center gap-1.5 text-zinc-500 text-xs truncate">
                  <MapPin size={12} className="shrink-0" />
                  <div className="truncate">
                    {renderLocation(booking.start_location, details.dep_terminal)}
                    {booking.end_location && (
                      <>
                        <span className="mx-1">→</span>
                        {renderLocation(booking.end_location, details.arr_terminal)}
                      </>
                    )}
                  </div>
                </div>
              )}
              {booking.provider && booking.category !== 'RENTAL' && (
                <div className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">
                  {booking.provider}{booking.order_id ? ` • ${booking.order_id}` : ''}
                </div>
              )}
              {booking.notes && (
                <div className="text-xs text-zinc-500 italic mt-1 line-clamp-2">{booking.notes}</div>
              )}
            </div>
          </div>
          {canEdit && !hasPhoto && (
            <div className="p-2 text-zinc-600 group-hover:text-orange-500 transition-colors">
              <Edit3 size={16} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
