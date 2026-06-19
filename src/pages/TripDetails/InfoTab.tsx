import React, { useState } from 'react';
import { Plus, Plane, Train, Ship, Car, Bed, Bus } from 'lucide-react';
import { isPast, isSameDay, parseISO } from 'date-fns';
import { Expense, Booking } from '../../types';
import { FinanceOverview } from '../../components/widgets/FinanceOverview';
import { BookingCard } from '../../components/cards/BookingCard';
import { clsx } from 'clsx';

interface InfoTabProps {
  expenses: Expense[];
  tripUsers: any[];
  currency: string;
  bookings: Booking[];
  bookingFilter?: string;
  setBookingFilter?: (f: string) => void;
  availableBookingCategories?: string[];
  canEdit: boolean;
  onAddBooking: () => void;
  onEditBooking: (booking: Booking) => void;
}

const GROUP_CONFIG = [
  { cat: 'FLIGHT',           icon: Plane, label: '機票' },
  { cat: 'TRAIN',            icon: Train, label: '火車' },
  { cat: 'FERRY',            icon: Ship,  label: '船票' },
  { cat: 'BUS',              icon: Bus,   label: '公車' },
  { cat: 'HOTEL',            icon: Bed,   label: '住宿' },
  { cat: 'RENTAL',           icon: Car,   label: '租車' },
  { cat: 'PRIVATE_TRANSFER', icon: Car,   label: '接送' },
] as const;

function sortBookings(list: Booking[]): Booking[] {
  const now = new Date();
  return [...list].sort((a, b) => {
    const dateA = parseISO(`${a.start_date}T${a.start_time || '00:00'}`);
    const dateB = parseISO(`${b.start_date}T${b.start_time || '00:00'}`);
    const aPast = isPast(dateA) && !isSameDay(dateA, now);
    const bPast = isPast(dateB) && !isSameDay(dateB, now);
    if (aPast && !bPast) return 1;
    if (!aPast && bPast) return -1;
    return dateA.getTime() - dateB.getTime();
  });
}

export function InfoTab({
  expenses, tripUsers, currency, bookings, canEdit, onAddBooking, onEditBooking,
}: InfoTabProps) {
  const [filter, setFilter] = useState<string>('ALL');

  const activeGroups = GROUP_CONFIG.filter(g => bookings.some(b => b.category === g.cat));

  const filteredBookings = filter === 'ALL'
    ? bookings
    : bookings.filter(b => b.category === filter);

  const displayGroups = filter === 'ALL'
    ? activeGroups
    : activeGroups.filter(g => g.cat === filter);

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-6">費用總覽</h3>
        <FinanceOverview expenses={expenses} members={tripUsers} currency={currency} />
      </div>

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between px-2">
          <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">訂票資料</h4>
        </div>

        {/* ── Filter bar ── */}
        {activeGroups.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {/* 全部 */}
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-[11px] font-black whitespace-nowrap transition-all border shrink-0',
                filter === 'ALL'
                  ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/25'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
              )}
            >
              全部
            </button>
            {activeGroups.map(({ cat, icon: Icon, label }) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={clsx(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-black whitespace-nowrap transition-all border shrink-0',
                  filter === cat
                    ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/25'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                )}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Booking cards ── */}
        {filteredBookings.length > 0 ? (
          <div className="space-y-5">
            {displayGroups.map(({ cat }) => {
              const group = sortBookings(filteredBookings.filter(b => b.category === cat));
              if (group.length === 0) return null;
              return (
                <div key={cat} className="space-y-2">
                  {group.flatMap(booking => {
                    const isRentalCat = booking.category === 'RENTAL';
                    if (isRentalCat) {
                      const hasReturn = !!(booking.end_time || (booking.end_date && booking.end_date !== booking.start_date));
                      return [
                        <BookingCard key={`${booking.id}-pickup`} booking={booking} canEdit={canEdit} onEdit={() => onEditBooking(booking)} rentalView="pickup" />,
                        ...(hasReturn ? [<BookingCard key={`${booking.id}-return`} booking={booking} canEdit={canEdit} onEdit={() => onEditBooking(booking)} rentalView="return" />] : []),
                      ];
                    }
                    return [<BookingCard key={booking.id} booking={booking} canEdit={canEdit} onEdit={() => onEditBooking(booking)} />];
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center text-zinc-500">
            <p className="text-sm">
              {filter === 'ALL' ? '尚無訂票資料' : '此類別無訂票資料'}
            </p>
          </div>
        )}

        {canEdit && (
          <button
            onClick={onAddBooking}
            className="w-full mt-2 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
          >
            <Plus size={20} /><span className="font-medium">＋ 新增訂票</span>
          </button>
        )}
      </div>
    </div>
  );
}
