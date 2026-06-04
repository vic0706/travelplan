import React from 'react';
import { Plus } from 'lucide-react';
import { isPast, isSameDay, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { Expense, Booking } from '../../types';
import { FinanceOverview } from '../../components/widgets/FinanceOverview';
import { BookingCard } from '../../components/cards/BookingCard';

interface InfoTabProps {
  expenses: Expense[];
  tripUsers: any[];
  currency: string;
  bookings: Booking[];
  bookingFilter: string;
  setBookingFilter: (f: string) => void;
  availableBookingCategories: string[];
  canEdit: boolean;
  onAddBooking: () => void;
  onEditBooking: (booking: Booking) => void;
}

export function InfoTab({
  expenses, tripUsers, currency, bookings, bookingFilter, setBookingFilter,
  availableBookingCategories, canEdit, onAddBooking, onEditBooking,
}: InfoTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-6">Expenses Overview</h3>
        <FinanceOverview expenses={expenses} members={tripUsers} currency={currency} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Bookings</h4>
          {canEdit && (
            <button onClick={onAddBooking} className="p-2 bg-orange-500/10 text-orange-500 rounded-full hover:bg-orange-500/20 transition-colors">
              <Plus size={18} />
            </button>
          )}
        </div>

        {bookings.length > 0 ? (
          <>
            {availableBookingCategories.length > 2 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar px-2 pb-2">
                {availableBookingCategories.map(cat => (
                  <button key={cat} onClick={() => setBookingFilter(cat)}
                    className={clsx('px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border',
                      bookingFilter === cat
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    )}>
                    {cat}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4">
              {bookings
                .filter(b => bookingFilter === 'ALL' || b.category === bookingFilter)
                .sort((a, b) => {
                  const now = new Date();
                  const dateA = parseISO(`${a.start_date}T${a.start_time}`);
                  const dateB = parseISO(`${b.start_date}T${b.start_time}`);
                  const aPast = isPast(dateA) && !isSameDay(dateA, now);
                  const bPast = isPast(dateB) && !isSameDay(dateB, now);
                  if (aPast && !bPast) return 1;
                  if (!aPast && bPast) return -1;
                  return dateA.getTime() - dateB.getTime();
                })
                .map(booking => (
                  <BookingCard key={booking.id} booking={booking} canEdit={canEdit}
                    onEdit={() => onEditBooking(booking)} />
                ))}
            </div>
          </>
        ) : (
          <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center text-zinc-500">
            <p className="text-sm">No bookings added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
